import { randomBytes } from "node:crypto";
import { and, asc, desc, eq, gte, inArray, isNotNull, isNull, lte, ne, notInArray, or, sql } from "drizzle-orm";
import { getDb, schema as s, type Db } from "@/database";
import { getSetting } from "@/database/seed";
import { ACTIVE_STATUSES, showsDriverLocation, STAFF_CANCEL_FROM, STAFF_CLOSE_FROM, STATUS_LABEL, type RideStatus } from "@/shared/transitions";
import { DEFAULT_WEIGHTS, rankCandidates, type Candidate, type DispatchWeights } from "@/shared/dispatch";
import { findRegion, haversineM, type LatLng } from "@/shared/geo";
import { couponDiscount, ledgerEffect, quoteFare, brl } from "@/shared/pricing";
import { DEFAULT_SCHEDULE, scheduleProblem, type ScheduleRules } from "@/shared/schedule";
import { getRoute } from "./geo";
import { DEFAULT_PAYMENT_RULES, driverAccepts, isDirect, type PaymentMethod, type PaymentRules } from "@/shared/payment-methods";
import { pixPayload } from "@/shared/pix";
import { rideRequestProblem } from "@/shared/account";
import { arriveProblem, completeCheck, driverFare } from "@/shared/ride-guards";
import { farCompletionReasonProblem, isStuck, scaleFareToTotal, staffChargeProblem, tripFraction } from "@/shared/ride-resolution";
import { withKeyLock } from "@/shared/keyed-lock";
import { JUMP_REVIEW_WINDOW_MS } from "@/shared/location-guard";
import { publish, rideChannel, STAFF_CHANNEL, userChannel } from "./bus";
import { createPixCharge, getPixStatus, paymentAvailability } from "./payments";
import { startOfPeriodSp } from "./sql-time";
import { audit } from "./audit-lite";
import { blockedByDebt } from "./debt";
import { securitySweep } from "./security-sweep";

class RideError extends Error {
  status = 409;
  constructor(message: string, public code?: string) { super(message); }
}
const fail = (msg: string): never => { throw new RideError(msg); };
export { RideError };

export async function notify(db: Db, userId: string, title: string, body: string, link?: string) {
  await db.insert(s.notifications).values({ userId, title, body, link });
  publish(userChannel(userId), "notification");
}

/** Corrida que terminou sem ser feita (cancelada, sem motorista): o uso do cupom volta. */
async function releaseCoupon(db: Db, ride: { couponId: string | null }) {
  if (ride.couponId) await db.update(s.coupons).set({ used: sql`greatest(${s.coupons.used} - 1, 0)` }).where(eq(s.coupons.id, ride.couponId));
}

function touchRide(ride: { id: string; passengerId: string; driverId: string | null; shareToken: string }) {
  publish(userChannel(ride.passengerId), "ride");
  if (ride.driverId) publish(userChannel(ride.driverId), "ride");
  publish(rideChannel(ride.shareToken), "ride");
  publish(STAFF_CHANNEL, "ride");
}

// ---------------------------------------------------------------- cotação

export async function activeCategoriesWithTariff(db: Db, regionId: string) {
  return db.select({ category: s.categories, tariff: s.tariffs })
    .from(s.tariffs)
    .innerJoin(s.categories, eq(s.tariffs.categoryId, s.categories.id))
    .innerJoin(s.modalities, eq(s.categories.modalityId, s.modalities.id))
    .where(and(eq(s.tariffs.regionId, regionId), eq(s.categories.active, true), eq(s.modalities.active, true)));
}

async function loadCoupon(db: Db, code?: string | null) {
  if (!code) return null;
  const [c] = await db.select().from(s.coupons).where(eq(s.coupons.code, code.trim().toUpperCase()));
  return c ?? null;
}

/** A conta já tem corrida (não cancelada) com este cupom? Cada conta usa o cupom uma vez. */
async function couponUsedBy(db: Db, passengerId: string, couponId: string) {
  const [again] = await db.select({ id: s.rides.id }).from(s.rides)
    .where(and(eq(s.rides.passengerId, passengerId), eq(s.rides.couponId, couponId), notInArray(s.rides.status, ["cancelled", "no_driver"]))).limit(1);
  return !!again;
}

/** method: só entram motoristas que recebem por essa forma (Pix exige chave; maquininha, ter uma). */
async function buildCandidates(db: Db, regionId: string, rideId?: string, method?: PaymentMethod): Promise<Candidate[]> {
  const all = await db.select({ d: s.drivers, u: s.users }).from(s.drivers).innerJoin(s.users, eq(s.drivers.userId, s.users.id))
    .where(and(eq(s.drivers.regionId, regionId), eq(s.drivers.online, true), eq(s.drivers.status, "approved"), eq(s.users.status, "active")));
  const rows = method ? all.filter((r) => driverAccepts(method, r.d)) : all;
  if (!rows.length) return [];
  const ids = rows.map((r) => r.d.userId);
  const [vehicles, busyRides, riding, pendingOffers, declined, earned] = await Promise.all([
    db.select().from(s.vehicles).where(and(inArray(s.vehicles.driverId, ids), eq(s.vehicles.status, "approved"))),
    db.select({ id: s.rides.driverId }).from(s.rides).where(and(inArray(s.rides.driverId, ids), inArray(s.rides.status, ["accepted", "arrived", "in_progress"]))),
    // Motorista também é passageiro: quem tem corrida aberta como passageiro não recebe oferta.
    db.select({ id: s.rides.passengerId }).from(s.rides).where(and(inArray(s.rides.passengerId, ids), inArray(s.rides.status, ACTIVE_STATUSES))),
    db.select({ id: s.offers.driverId }).from(s.offers).where(and(inArray(s.offers.driverId, ids), eq(s.offers.status, "pending"))),
    rideId ? db.select({ id: s.offers.driverId }).from(s.offers).where(eq(s.offers.rideId, rideId)) : Promise.resolve([]),
    db.select({ id: s.rides.driverId, total: sql<number>`coalesce(sum(${s.rides.driverNetCents}),0)::int` }).from(s.rides)
      .where(and(inArray(s.rides.driverId, ids), eq(s.rides.status, "completed"), gte(s.rides.endedAt, startOfPeriodSp("day")))).groupBy(s.rides.driverId),
  ]);
  const busy = new Set([...busyRides, ...riding, ...pendingOffers].map((r) => r.id));
  const seen = new Set(declined.map((r) => r.id));
  const now = Date.now();
  return rows.filter((r) => r.d.lat !== null && r.d.lng !== null).map(({ d, u }) => ({
    driverId: d.userId, lat: d.lat!, lng: d.lng!, online: d.online, approved: d.status === "approved",
    busy: busy.has(d.userId), regionId: d.regionId,
    categoryIds: vehicles.filter((v) => v.driverId === d.userId).map((v) => v.categoryId),
    locationAgeS: d.locationAt ? (now - d.locationAt.getTime()) / 1000 : Infinity,
    idleS: d.idleSince ? (now - d.idleSince.getTime()) / 1000 : 0,
    offersTotal: d.offersTotal, offersAccepted: d.offersAccepted, cancelsTotal: d.cancelsTotal, ridesTotal: d.ridesTotal,
    ratingSum: d.ratingSum, ratingCount: d.ratingCount,
    earnedTodayCents: earned.find((e) => e.id === d.userId)?.total ?? 0,
    declinedThisRide: seen.has(d.userId),
  }));
}

export const MAX_STOPS = 2;

/**
 * Motoristas online de verdade perto de um ponto, para o mapa do passageiro.
 * Privacidade: sem nome nem identificação, e a posição vai arredondada para uma grade de ~200 m.
 */
export async function nearbyDrivers(center: LatLng, radiusKm = 6, excludeUserId?: string) {
  const db = await getDb();
  const freshSince = new Date(Date.now() - 3 * 60_000);
  const rows = await db.select({ lat: s.drivers.lat, lng: s.drivers.lng }).from(s.drivers).innerJoin(s.users, eq(s.drivers.userId, s.users.id))
    .where(and(eq(s.drivers.online, true), eq(s.drivers.status, "approved"), eq(s.users.status, "active"), gte(s.drivers.locationAt, freshSince),
      excludeUserId ? ne(s.drivers.userId, excludeUserId) : undefined));
  const grid = 0.002;
  const snap = (v: number) => Math.round(v / grid) * grid;
  const cars = rows.filter((r): r is { lat: number; lng: number } => r.lat !== null && r.lng !== null)
    .filter((r) => haversineM(center, r) <= radiusKm * 1000)
    .map((r) => ({ lat: Number(snap(r.lat).toFixed(4)), lng: Number(snap(r.lng).toFixed(4)) }));
  return { count: cars.length, cars: cars.slice(0, 20) };
}

/** passengerId: quem cota. Se for motorista, ele mesmo não entra na conta de motoristas disponíveis. */
export async function quote(origin: LatLng, dest: LatLng, couponCode?: string | null, stops: LatLng[] = [], passengerId?: string) {
  const db = await getDb();
  const regions = await db.select().from(s.regions);
  const region = findRegion(origin, regions);
  if (!region) fail("Ainda não atendemos este ponto de partida. A Orbi opera em Ipatinga, Coronel Fabriciano e Timóteo.");
  if (!findRegion(dest, regions)) fail("O destino fica fora da nossa área de atendimento.");
  if (stops.length > MAX_STOPS) fail(`Dá para incluir até ${MAX_STOPS} paradas.`);
  if (stops.some((p) => !findRegion(p, regions))) fail("Uma das paradas fica fora da nossa área de atendimento.");
  // O preço segue a tarifa sobre a distância e o tempo do trajeto completo, com as paradas.
  const route = await getRoute(origin, dest, stops);
  const coupon = await loadCoupon(db, couponCode);
  if (couponCode && !coupon) fail("Cupom não encontrado.");
  if (coupon && passengerId && (await couponUsedBy(db, passengerId, coupon.id))) fail("Você já usou este cupom.");
  const candidates = await buildCandidates(db, region!.id);
  const weights = await getSetting<DispatchWeights>(db, "dispatchWeights", DEFAULT_WEIGHTS);
  const rows = await activeCategoriesWithTariff(db, region!.id);
  const options = rows.map(({ category, tariff }) => {
    const base = quoteFare(tariff, route.distanceM, route.durationS);
    const discountCents = coupon ? couponDiscount(coupon, base.grossCents + base.serviceFeeCents) : 0;
    const fare = quoteFare(tariff, route.distanceM, route.durationS, { discountCents });
    const ranked = rankCandidates(candidates, { origin, categoryId: category.id, regionId: region!.id, driverNetCents: fare.driverNetCents, passengerId }, weights);
    const fastest = ranked.length ? Math.min(...ranked.map((r) => r.pickupEtaS)) : null;
    return {
      categoryId: category.id, slug: category.slug, name: category.name, description: category.description, seats: category.seats,
      ...fare, pickupEtaS: fastest, driversAvailable: ranked.length,
    };
  });
  // Quantos motoristas online agora recebem por Pix na chave e por maquininha: o passageiro sabe antes de escolher.
  const [byPix, byCard] = await Promise.all([buildCandidates(db, region!.id, undefined, "pix_driver"), buildCandidates(db, region!.id, undefined, "card_machine")]);
  return {
    region: { id: region!.id, name: region!.name }, route, options, couponApplied: !!coupon && options.some((o) => o.discountCents > 0),
    payment: paymentAvailability(await paymentRules(db)),
    acceptingNow: { pix_driver: byPix.filter((c) => c.driverId !== passengerId).length, card_machine: byCard.filter((c) => c.driverId !== passengerId).length },
  };
}

export const paymentRules = (db: Db) => getSetting<PaymentRules>(db, "payments", DEFAULT_PAYMENT_RULES);

/** Situação de quem também é motorista: online e com corrida aberta como motorista. null: nunca fez cadastro de motorista. */
async function driverWorkState(db: Db, userId: string) {
  const [d] = await db.select({ online: s.drivers.online }).from(s.drivers).where(eq(s.drivers.userId, userId));
  const [working] = await db.select({ id: s.rides.id }).from(s.rides).where(and(eq(s.rides.driverId, userId), inArray(s.rides.status, ACTIVE_STATUSES))).limit(1);
  if (!d && !working) return null;
  return { online: !!d?.online, activeRide: !!working };
}

// ---------------------------------------------------------------- pedido e distribuição

type RideInput = {
  origin: LatLng & { label: string }; dest: LatLng & { label: string }; categoryId: string; paymentMethod: PaymentMethod; couponCode?: string | null;
  rider?: { name: string; phone: string } | null;
  stops?: (LatLng & { label: string })[]; scheduledFor?: Date | null;
};

/**
 * Pedidos da mesma conta entram um de cada vez: a conferência de "corrida aberta" e de "cupom já usado" e o insert
 * não ficam com janela para dois pedidos simultâneos passarem juntos. Trava em memória (uma instância); uma garantia
 * no banco (índice único parcial) exigiria migração e limpeza dos dados atuais, e fica como pendência.
 */
export const requestRide = (passengerId: string, input: RideInput) => withKeyLock(`request-ride:${passengerId}`, () => requestRideLocked(passengerId, input));

async function requestRideLocked(passengerId: string, input: RideInput) {
  const db = await getDb();
  const stops = input.stops ?? [];
  const scheduledFor = input.scheduledFor ?? null;
  // Motorista também pede corrida, mas só offline e sem corrida aberta como motorista.
  const working = rideRequestProblem(await driverWorkState(db, passengerId));
  if (working) fail(working);
  if (scheduledFor) {
    // Agendada: não ocupa a conta agora; o limite evita reservas em excesso.
    const rules = await getSetting<ScheduleRules>(db, "schedule", DEFAULT_SCHEDULE);
    const problem = scheduleProblem(scheduledFor, new Date(), rules);
    if (problem) fail(problem);
    const booked = await db.select({ id: s.rides.id }).from(s.rides).where(and(eq(s.rides.passengerId, passengerId), eq(s.rides.status, "scheduled")));
    if (booked.length >= rules.maxPerPassenger) fail(`Você já tem ${rules.maxPerPassenger} corridas agendadas. Cancele uma para agendar outra.`);
  } else {
    const open = await db.select({ id: s.rides.id }).from(s.rides).where(and(eq(s.rides.passengerId, passengerId), inArray(s.rides.status, ACTIVE_STATUSES)));
    if (open.length) fail("Você já tem uma corrida em andamento.");
  }
  if (!paymentAvailability(await paymentRules(db))[input.paymentMethod].available) fail("Esta forma de pagamento não está disponível agora.");

  const q = await quote(input.origin, input.dest, input.couponCode, stops, passengerId);
  const opt = q.options.find((o) => o.categoryId === input.categoryId);
  if (!opt) fail("Categoria indisponível nesta região.");
  const coupon = await loadCoupon(db, input.couponCode);
  const usesCoupon = opt!.discountCents > 0 && !!coupon;
  // Uma vez por conta: quem já tem corrida (não cancelada) com este cupom não o usa de novo.
  if (usesCoupon) {
    if (await couponUsedBy(db, passengerId, coupon!.id)) fail("Você já usou este cupom.");
    // Reserva o uso na hora e de forma atômica: só sobe se ainda houver usos (dois pedidos juntos não passam do limite).
    const [taken] = await db.update(s.coupons).set({ used: sql`${s.coupons.used} + 1` })
      .where(and(eq(s.coupons.id, coupon!.id), or(isNull(s.coupons.maxUses), sql`${s.coupons.used} < ${s.coupons.maxUses}`))).returning({ id: s.coupons.id });
    if (!taken) fail("Este cupom esgotou.");
  }

  let ride: typeof s.rides.$inferSelect;
  try {
    [ride] = await db.insert(s.rides).values({
    passengerId, regionId: q.region.id, categoryId: input.categoryId,
    originLabel: input.origin.label, originLat: input.origin.lat, originLng: input.origin.lng,
    destLabel: input.dest.label, destLat: input.dest.lat, destLng: input.dest.lng,
    distanceM: q.route.distanceM, durationS: q.route.durationS, geometry: q.route.geometry, routeSource: q.route.source,
    stops: stops.map((p) => ({ label: p.label, lat: p.lat, lng: p.lng })),
    status: scheduledFor ? "scheduled" : "searching", scheduledFor, searchStartedAt: scheduledFor ? null : new Date(),
    grossCents: opt!.grossCents, serviceFeeCents: opt!.serviceFeeCents, discountCents: opt!.discountCents, totalCents: opt!.totalCents,
    commissionBps: opt!.commissionBps, tariffCommissionBps: opt!.commissionBps, commissionCents: opt!.commissionCents, driverNetCents: opt!.driverNetCents,
    couponId: usesCoupon ? coupon!.id : null, paymentMethod: input.paymentMethod,
    riderName: input.rider?.name ?? null, riderPhone: input.rider?.phone ?? null, shareToken: randomBytes(18).toString("base64url"),
    }).returning();
  } catch (e) {
    // Não criou a corrida: devolve o uso reservado.
    if (usesCoupon) await db.update(s.coupons).set({ used: sql`greatest(${s.coupons.used} - 1, 0)` }).where(eq(s.coupons.id, coupon!.id));
    throw e;
  }
  publish(STAFF_CHANNEL, "ride");
  if (!scheduledFor) await dispatchNext(db, ride.id);
  return ride;
}

/**
 * Corridas agendadas cujo horário de busca chegou entram na fila. Se a pessoa já estiver em outra corrida,
 * a agendada é cancelada com aviso, porque a conta só acompanha uma corrida por vez.
 */
async function activateScheduled(db: Db) {
  const rules = await getSetting<ScheduleRules>(db, "schedule", DEFAULT_SCHEDULE);
  const due = await db.select().from(s.rides).where(and(eq(s.rides.status, "scheduled"), lte(s.rides.scheduledFor, new Date(Date.now() + rules.searchLeadMin * 60_000))));
  for (const ride of due) {
    // Passageiro suspenso ou excluído não ativa corrida agendada: ela é cancelada, sem cobrança.
    const [who] = await db.select({ status: s.users.status }).from(s.users).where(eq(s.users.id, ride.passengerId));
    if (who?.status !== "active") {
      const [gone] = await db.update(s.rides).set({ status: "cancelled", cancelledBy: "system", endedAt: new Date(), cancelReason: "Conta indisponível no horário agendado" })
        .where(and(eq(s.rides.id, ride.id), eq(s.rides.status, "scheduled"))).returning();
      if (gone) { await releaseCoupon(db, gone); touchRide(gone); }
      continue;
    }
    // Também conta a corrida que a pessoa estiver fazendo como motorista, e estar online como motorista.
    const open = await db.select({ id: s.rides.id }).from(s.rides)
      .where(and(or(eq(s.rides.passengerId, ride.passengerId), eq(s.rides.driverId, ride.passengerId)), inArray(s.rides.status, ACTIVE_STATUSES)));
    const online = !open.length && !!rideRequestProblem(await driverWorkState(db, ride.passengerId));
    if (open.length || online) {
      const [done] = await db.update(s.rides).set({
        status: "cancelled", cancelledBy: "system", endedAt: new Date(),
        cancelReason: online ? "Passageiro online como motorista no horário agendado" : "Passageiro em outra corrida no horário agendado",
      }).where(and(eq(s.rides.id, ride.id), eq(s.rides.status, "scheduled"))).returning();
      if (done) {
        await releaseCoupon(db, done);
        await notify(db, ride.passengerId, "Corrida agendada cancelada", online
          ? "No horário agendado você estava online como motorista. Para viajar, fique offline e peça de novo. Nada foi cobrado."
          : "No horário agendado você já estava em outra corrida. Nada foi cobrado.", "/passageiro/viagens");
        touchRide(done);
      }
      continue;
    }
    const [started] = await db.update(s.rides).set({ status: "searching", searchStartedAt: new Date() })
      .where(and(eq(s.rides.id, ride.id), eq(s.rides.status, "scheduled"))).returning();
    if (!started) continue;
    await notify(db, ride.passengerId, "Procurando motorista", "Chegou a hora da sua corrida agendada: já estamos buscando um motorista.", "/passageiro");
    touchRide(started);
    await dispatchNext(db, ride.id);
  }
}

/** Cancela as corridas agendadas de uma pessoa (conta suspensa ou excluída), devolvendo o cupom. Nada é cobrado. */
export async function cancelScheduledRides(userId: string, reason: string, tx?: Db) {
  const db = tx ?? (await getDb());
  const done = await db.update(s.rides).set({ status: "cancelled", cancelledBy: "system", endedAt: new Date(), cancelReason: reason })
    .where(and(eq(s.rides.passengerId, userId), eq(s.rides.status, "scheduled"))).returning();
  for (const r of done) { await releaseCoupon(db, r); touchRide(r); }
  return done.length;
}

/** Comissão da tarifa guardada no pedido (corridas antigas, sem o campo, ainda têm a da tarifa em commissionBps). */
const tariffBps = (ride: typeof s.rides.$inferSelect) => ride.tariffCommissionBps ?? ride.commissionBps;

/** Valores da corrida sem plano nenhum, para devolver o pedido à fila sem herdar a comissão de quem desistiu. */
function tariffFare(ride: typeof s.rides.$inferSelect) {
  const commissionBps = tariffBps(ride);
  const commissionCents = Math.round((ride.grossCents * commissionBps) / 10000);
  return { commissionBps, commissionCents, driverNetCents: ride.grossCents - commissionCents };
}

/** Comissão efetiva para este motorista: parte da tarifa e o plano ativo dele só pode reduzi-la (nunca aumentar). */
export async function fareForDriver(db: Db, ride: typeof s.rides.$inferSelect, driverId: string) {
  const [row] = await db.select({ d: s.drivers, p: s.plans }).from(s.drivers).leftJoin(s.plans, eq(s.drivers.planId, s.plans.id)).where(eq(s.drivers.userId, driverId));
  const planActive = row?.p && row.d.planUntil && row.d.planUntil > new Date();
  return driverFare(ride.grossCents, tariffBps(ride), planActive ? { tier: row.p!.tier, commissionBps: row.p!.commissionBps } : null);
}

/** Violação de índice único (23505), com o erro direto do driver ou embrulhado pelo Drizzle. */
export const isUniqueViolation = (e: unknown) => {
  const x = e as { code?: string; cause?: { code?: string } } | null;
  return x?.code === "23505" || x?.cause?.code === "23505";
};

export async function dispatchNext(db: Db, rideId: string) {
  const [ride] = await db.select().from(s.rides).where(eq(s.rides.id, rideId));
  if (!ride || ride.status !== "searching") return;
  const pending = await db.select({ id: s.offers.id }).from(s.offers).where(and(eq(s.offers.rideId, rideId), eq(s.offers.status, "pending")));
  if (pending.length) return;

  const cfg = await getSetting(db, "dispatch", { offerTimeoutS: 20, searchTimeoutS: 180 });
  const weights = await getSetting<DispatchWeights>(db, "dispatchWeights", DEFAULT_WEIGHTS);
  const candidates = await buildCandidates(db, ride.regionId, ride.id, ride.paymentMethod);
  const ranked = rankCandidates(candidates, {
    origin: { lat: ride.originLat, lng: ride.originLng }, categoryId: ride.categoryId, regionId: ride.regionId, driverNetCents: ride.driverNetCents,
    passengerId: ride.passengerId,
  }, weights);

  if (!ranked.length) {
    if (Date.now() - (ride.searchStartedAt ?? ride.createdAt).getTime() > cfg.searchTimeoutS * 1000) {
      const [done] = await db.update(s.rides).set({ status: "no_driver", endedAt: new Date() })
        .where(and(eq(s.rides.id, rideId), eq(s.rides.status, "searching"))).returning();
      if (done) {
        await releaseCoupon(db, done);
        await notify(db, ride.passengerId, "Nenhum motorista disponível", "Não encontramos motorista agora. Nada foi cobrado.", "/passageiro");
        touchRide(done);
      }
    }
    return;
  }
  const top = ranked[0];
  try {
    await db.insert(s.offers).values({
      rideId, driverId: top.candidate.driverId, score: top.score, breakdown: top.breakdown,
      pickupDistanceM: top.pickupDistanceM, pickupEtaS: top.pickupEtaS, expiresAt: new Date(Date.now() + cfg.offerTimeoutS * 1000),
    });
  } catch (e) {
    // Índices únicos parciais: já há oferta pendente para esta corrida ou para este motorista (outra rodada se adiantou).
    if (isUniqueViolation(e)) return;
    throw e;
  }
  await db.update(s.drivers).set({ offersTotal: sql`${s.drivers.offersTotal} + 1` }).where(eq(s.drivers.userId, top.candidate.driverId));
  publish(userChannel(top.candidate.driverId), "offer");
  publish(STAFF_CHANNEL, "ride");
}

const sweepState = globalThis as unknown as { __prumoSweeping?: boolean; __prumoPixPolling?: boolean };

/** Quem é da equipe e está ativo recebe o aviso no painel. */
async function notifyStaff(db: Db, title: string, body: string, link: string) {
  const staff = await db.select({ id: s.users.id }).from(s.users).where(and(inArray(s.users.role, ["admin", "gestor", "atendente"]), eq(s.users.status, "active")));
  for (const a of staff) await notify(db, a.id, title, body, link);
}

/**
 * Corrida em viagem há mais de 3x a duração estimada (mínimo 60 min) vai para revisão: avisa a equipe uma única vez
 * e marca a corrida. Não encerra sozinha: quem decide é a equipe (encerrar cobrando ou cancelar).
 */
async function flagStuckRides(db: Db) {
  const rows = await db.select().from(s.rides)
    .where(and(eq(s.rides.status, "in_progress"), isNull(s.rides.reviewReason), lte(s.rides.startedAt, new Date(Date.now() - 3600_000))));
  for (const r of rows) {
    if (!isStuck(r.startedAt, r.durationS)) continue;
    const [flagged] = await db.update(s.rides).set({ reviewReason: "Em viagem há muito mais tempo que o previsto" })
      .where(and(eq(s.rides.id, r.id), eq(s.rides.status, "in_progress"), isNull(s.rides.reviewReason))).returning({ id: s.rides.id });
    if (!flagged) continue;
    await audit(null, "ride.review_flag", "ride", r.id, { event: "stuck", reason: "em viagem além de 3x a duração prevista" });
    await notifyStaff(db, "Corrida para revisão", `A corrida ${r.id.slice(0, 8)} está em viagem há muito mais tempo que o previsto. Encerre ou cancele em Viagens.`, "/admin/viagens");
    await notify(db, r.passengerId, "Sua corrida está em revisão", "Sua viagem está durando mais que o previsto e a equipe da Orbi vai revisar. Se precisar, fale com o suporte.", "/passageiro");
    publish(STAFF_CHANNEL, "ride");
  }
}

export async function sweep() {
  // Uma rodada por vez: se a anterior ainda não terminou, esta é pulada (evita ofertas e avisos duplicados).
  if (sweepState.__prumoSweeping) return;
  sweepState.__prumoSweeping = true;
  try {
    const db = await getDb();
    const expired = await db.update(s.offers).set({ status: "expired" })
      .where(and(eq(s.offers.status, "pending"), lte(s.offers.expiresAt, new Date()))).returning();
    for (const o of expired) publish(userChannel(o.driverId), "offer");
    await activateScheduled(db);
    const searching = await db.select({ id: s.rides.id }).from(s.rides).where(eq(s.rides.status, "searching"));
    for (const r of searching) await dispatchNext(db, r.id);
    await flagStuckRides(db);
    await securitySweep().catch((e) => console.error("[sweep-seguranca]", e));
  } finally { sweepState.__prumoSweeping = false; }
}

const PIX_POLL_MS = 20_000;
const PIX_POLL_TIMEOUT_MS = 4_000;
const PIX_POLL_BATCH = 50;
const PIX_POLL_PARALLEL = 5;

/**
 * Pergunta ao provedor pelos Pix pendentes. Roda fora do sweeper (oferta e despacho nunca esperam a rede do provedor),
 * num intervalo próprio, com timeout curto por consulta, poucas consultas em paralelo e sem sobreposição de rodadas.
 */
export async function pollPixPayments() {
  if (!process.env.MERCADOPAGO_ACCESS_TOKEN || sweepState.__prumoPixPolling) return;
  sweepState.__prumoPixPolling = true;
  try {
    const db = await getDb();
    const pending = await db.select({ rideId: s.payments.rideId }).from(s.payments)
      .where(and(eq(s.payments.status, "pending"), eq(s.payments.provider, "mercadopago"), isNotNull(s.payments.externalId)))
      .orderBy(asc(s.payments.createdAt)).limit(PIX_POLL_BATCH);
    for (let i = 0; i < pending.length; i += PIX_POLL_PARALLEL) {
      await Promise.all(pending.slice(i, i + PIX_POLL_PARALLEL).map((p) => refreshPayment(p.rideId, { timeoutMs: PIX_POLL_TIMEOUT_MS }).catch((e) => console.error("[pagamento]", e))));
    }
  } finally { sweepState.__prumoPixPolling = false; }
}

const g = globalThis as unknown as { __prumoSweeper?: NodeJS.Timeout; __prumoPixPoller?: NodeJS.Timeout };
export function ensureSweeper() {
  if (g.__prumoSweeper) return;
  g.__prumoSweeper = setInterval(() => { sweep().catch((e) => console.error("[sweep]", e)); }, 4000);
  g.__prumoSweeper.unref?.();
  if (!g.__prumoPixPoller) {
    g.__prumoPixPoller = setInterval(() => { pollPixPayments().catch((e) => console.error("[pix]", e)); }, PIX_POLL_MS);
    g.__prumoPixPoller.unref?.();
  }
}

// ---------------------------------------------------------------- resposta do motorista

/** Motorista ficou offline: as ofertas pendentes dele expiram na hora e as corridas seguem para outro motorista. */
export async function releaseOffers(driverId: string) {
  const db = await getDb();
  const released = await db.update(s.offers).set({ status: "expired" })
    .where(and(eq(s.offers.driverId, driverId), eq(s.offers.status, "pending"))).returning();
  if (released.length) publish(userChannel(driverId), "offer");
  for (const o of released) await dispatchNext(db, o.rideId);
}

export async function respondToOffer(driverId: string, offerId: string, accept: boolean) {
  const db = await getDb();
  const [offer] = await db.select().from(s.offers).where(and(eq(s.offers.id, offerId), eq(s.offers.driverId, driverId)));
  if (!offer) fail("Oferta não encontrada.");
  if (!accept) {
    const [o] = await db.update(s.offers).set({ status: "declined" }).where(and(eq(s.offers.id, offerId), eq(s.offers.status, "pending"))).returning();
    if (o) await dispatchNext(db, o.rideId);
    publish(userChannel(driverId), "offer");
    return { ok: true };
  }
  // Motorista também é passageiro, mas nunca nos dois papéis ao mesmo tempo: offline ou com corrida
  // própria aberta, a oferta (que pode ter ficado pendente) não é aceita e segue para outro motorista.
  const [me] = await db.select({ online: s.drivers.online }).from(s.drivers).where(eq(s.drivers.userId, driverId));
  const ownRide = await activeRideFor(driverId, "passenger");
  // Já está numa corrida como motorista: a oferta pendente não vale e segue para outro.
  if (await activeRideFor(driverId, "driver")) {
    const [o] = await db.update(s.offers).set({ status: "declined" }).where(and(eq(s.offers.id, offerId), eq(s.offers.status, "pending"))).returning();
    if (o) await dispatchNext(db, o.rideId);
    publish(userChannel(driverId), "offer");
    fail("Você já está em uma corrida. Termine antes de aceitar outra.");
  }
  if (!me?.online || ownRide) {
    const [o] = await db.update(s.offers).set({ status: "declined" }).where(and(eq(s.offers.id, offerId), eq(s.offers.status, "pending"))).returning();
    if (o) await dispatchNext(db, o.rideId);
    publish(userChannel(driverId), "offer");
    fail(ownRide ? "Você tem uma corrida em andamento como passageiro. Termine ou cancele antes de aceitar corridas." : "Fique online para aceitar corridas.");
  }
  const [claimed] = await db.update(s.offers).set({ status: "accepted" })
    .where(and(eq(s.offers.id, offerId), eq(s.offers.status, "pending"), gte(s.offers.expiresAt, new Date()))).returning();
  if (!claimed) fail("Esta oferta expirou.");
  const [ride] = await db.select().from(s.rides).where(eq(s.rides.id, offer!.rideId));
  const [vehicle] = await db.select().from(s.vehicles).where(and(eq(s.vehicles.driverId, driverId), eq(s.vehicles.categoryId, ride.categoryId), eq(s.vehicles.status, "approved")));
  if (!vehicle) fail("Você não tem veículo aprovado para esta categoria.");
  const fare = await fareForDriver(db, ride, driverId);
  const [updated] = await db.update(s.rides).set({ status: "accepted", driverId, vehicleId: vehicle!.id, acceptedAt: new Date(), ...fare })
    .where(and(eq(s.rides.id, ride.id), eq(s.rides.status, "searching"))).returning();
  if (!updated) fail("O passageiro cancelou este pedido.");
  await db.update(s.drivers).set({ offersAccepted: sql`${s.drivers.offersAccepted} + 1`, idleSince: null }).where(eq(s.drivers.userId, driverId));
  await notify(db, ride.passengerId, "Motorista a caminho", `Placa ${vehicle!.plate} · ${vehicle!.make} ${vehicle!.model} ${vehicle!.color}`, "/passageiro");
  touchRide(updated);
  return updated;
}

// ---------------------------------------------------------------- andamento

async function move(rideId: string, driverId: string, from: RideStatus, to: RideStatus, set: Partial<typeof s.rides.$inferInsert>) {
  const db = await getDb();
  const [ride] = await db.update(s.rides).set({ status: to, ...set })
    .where(and(eq(s.rides.id, rideId), eq(s.rides.driverId, driverId), eq(s.rides.status, from))).returning();
  if (!ride) fail("A corrida não está mais nesta etapa.");
  touchRide(ride!);
  return ride!;
}

/**
 * Antifraude: "cheguei" e "encerrar" valem só com o motorista no lugar certo (última posição do GPS dele) e, no fim,
 * depois de um tempo mínimo. No modo de teste (posição manual permitida) a conferência fica desligada, a menos que
 * PRUMO_RIDE_GUARDS=strict. Os testes automáticos usam strict, com PRUMO_COMPLETE_MIN_FACTOR e PRUMO_COMPLETE_MIN_S em 0.
 */
const manualTestMode = () => process.env.ALLOW_MANUAL_LOCATION === "true" || process.env.NODE_ENV !== "production";
const guardsOn = () => process.env.PRUMO_RIDE_GUARDS === "strict" || !manualTestMode();
const numEnv = (k: string) => { const v = process.env[k]; return v === undefined || v === "" || !Number.isFinite(Number(v)) ? undefined : Number(v); };

async function driverPosition(db: Db, driverId: string) {
  const [d] = await db.select({ lat: s.drivers.lat, lng: s.drivers.lng, at: s.drivers.locationAt }).from(s.drivers).where(eq(s.drivers.userId, driverId));
  return d ?? null;
}

/**
 * "Cheguei"/"encerrar" logo depois de um salto de GPS recusado (driver.location_jump) vira um registro de revisão
 * (ride.review_flag) na auditoria, para a equipe olhar antes de pagar bônus. Só registra: não bloqueia a corrida.
 * Sem coluna nova no banco de propósito; marcar a corrida na tela do painel ou reter o bônus é decisão de produto.
 */
async function flagAfterJump(rideId: string, driverId: string, event: "arrived" | "completed") {
  try {
    const db = await getDb();
    const since = new Date(Date.now() - JUMP_REVIEW_WINDOW_MS);
    const [jump] = await db.select({ id: s.auditLog.id }).from(s.auditLog)
      .where(and(eq(s.auditLog.actorId, driverId), eq(s.auditLog.action, "driver.location_jump"), gte(s.auditLog.createdAt, since))).limit(1);
    if (jump) await db.insert(s.auditLog).values({ actorId: driverId, action: "ride.review_flag", entity: "ride", entityId: rideId, meta: { event, reason: "salto de GPS recente" } });
  } catch (e) { console.error("[revisão]", e); }
}

export async function markArrived(rideId: string, driverId: string) {
  if (guardsOn()) {
    const db = await getDb();
    const [r] = await db.select().from(s.rides).where(and(eq(s.rides.id, rideId), eq(s.rides.driverId, driverId), eq(s.rides.status, "accepted")));
    if (r) {
      const problem = arriveProblem(await driverPosition(db, driverId), { lat: r.originLat, lng: r.originLng });
      if (problem) fail(problem);
    }
  }
  const ride = await move(rideId, driverId, "accepted", "arrived", { arrivedAt: new Date() });
  await flagAfterJump(rideId, driverId, "arrived");
  await notify(await getDb(), ride.passengerId, "Seu motorista chegou", "Confira a placa antes de embarcar.", "/passageiro");
  return ride;
}
export const startTrip = (rideId: string, driverId: string) => move(rideId, driverId, "arrived", "in_progress", { startedAt: new Date() });

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

async function settle(db: Tx, ride: typeof s.rides.$inferSelect) {
  const effect = ledgerEffect(ride.paymentMethod, ride);
  const how: Partial<Record<PaymentMethod, string>> = { cash: "Corrida em dinheiro", pix_driver: "Corrida com Pix na sua chave", card_machine: "Corrida na sua maquininha" };
  const description = isDirect(ride.paymentMethod)
    ? `${how[ride.paymentMethod]}: você recebeu ${brl(ride.totalCents)}, seu líquido é ${brl(ride.driverNetCents)}`
    : `Corrida: bruto ${brl(ride.grossCents)}, comissão ${brl(ride.commissionCents)}`;
  await db.insert(s.ledger).values({ driverId: ride.driverId!, rideId: ride.id, description, ...effect });
  const bonuses = await db.select().from(s.campaigns).where(and(
    eq(s.campaigns.active, true), eq(s.campaigns.kind, "bonus"), or(isNull(s.campaigns.regionId), eq(s.campaigns.regionId, ride.regionId)),
    or(isNull(s.campaigns.startsAt), lte(s.campaigns.startsAt, new Date())), or(isNull(s.campaigns.endsAt), gte(s.campaigns.endsAt, new Date())),
  ));
  for (const b of bonuses) {
    if (b.bonusPerRideCents > 0) await db.insert(s.ledger).values({ driverId: ride.driverId!, rideId: ride.id, type: "bonus", amountCents: b.bonusPerRideCents, description: `Bônus: ${b.name}` });
  }
}

/**
 * Fecha a corrida em viagem: status, contagem do motorista e, quando o pagamento é direto, o pagamento e os lançamentos,
 * tudo numa transação (ou entra tudo ou nada). Pix pelo provedor: a cobrança é criada logo depois, fora da transação
 * (é uma chamada de rede), e o lançamento sai quando o pagamento é confirmado (refreshPayment).
 * `fare`: valores novos quando a corrida é cobrada por trecho ou por valor da equipe; `review`: motivo de revisão.
 */
async function finishTrip(rideId: string, o: { driverId?: string; fare?: ReturnType<typeof scaleFareToTotal>; review?: string }) {
  const db = await getDb();
  const ride = await db.transaction(async (tx) => {
    const [done] = await tx.update(s.rides).set({ status: "completed", endedAt: new Date(), ...(o.fare ?? {}), ...(o.review ? { reviewReason: o.review } : {}) })
      .where(and(eq(s.rides.id, rideId), eq(s.rides.status, "in_progress"), o.driverId ? eq(s.rides.driverId, o.driverId) : undefined)).returning();
    if (!done) return fail("A corrida não está mais nesta etapa.");
    await tx.update(s.drivers).set({ ridesTotal: sql`${s.drivers.ridesTotal} + 1`, idleSince: new Date() }).where(eq(s.drivers.userId, done.driverId!));
    if (isDirect(done.paymentMethod)) {
      // Pago na mão do motorista (dinheiro, Pix na chave dele ou maquininha dele): o extrato registra a comissão a acertar.
      await tx.insert(s.payments).values({ rideId, method: done.paymentMethod, provider: "manual", status: "paid", amountCents: done.totalCents });
      await tx.update(s.rides).set({ paymentStatus: "paid" }).where(eq(s.rides.id, rideId));
      await settle(tx, done);
    }
    return done;
  });
  if (!isDirect(ride.paymentMethod)) {
    const [passenger] = await db.select().from(s.users).where(eq(s.users.id, ride.passengerId));
    try {
      const charge = await createPixCharge({ rideId, amountCents: ride.totalCents, payerEmail: passenger.email ?? "" });
      await db.insert(s.payments).values({ rideId, method: ride.paymentMethod, provider: "mercadopago", amountCents: ride.totalCents, externalId: charge.externalId, pixCopyPaste: charge.copyPaste });
    } catch (e) {
      console.error("[pagamento]", e);
      await db.update(s.rides).set({ paymentStatus: "failed" }).where(eq(s.rides.id, rideId));
    }
  }
  await notify(db, ride.passengerId, "Viagem concluída", "Conte como foi avaliando seu motorista.", "/passageiro");
  await notify(db, ride.driverId!, "Corrida concluída", `Líquido desta corrida: ${brl(ride.driverNetCents)}`, "/motorista/ganhos");
  touchRide(ride);
  return ride;
}

/**
 * Encerrar longe do destino (mais de 500 m) é permitido com um motivo, por exemplo "passageiro desceu antes".
 * A corrida é cobrada pelo trecho feito (da partida até a posição do motorista, no mínimo a fração mínima de viagem)
 * e fica marcada para revisão da equipe (rides.review_reason e ride.review_flag na auditoria).
 * Tempo mínimo e GPS indisponível continuam sem exceção.
 */
export async function completeTrip(rideId: string, driverId: string, opts: { reason?: string } = {}) {
  const db = await getDb();
  let fare: ReturnType<typeof scaleFareToTotal> | undefined;
  let review: string | undefined;
  let far: { reason: string; chargedCents: number; estimatedCents: number } | null = null;
  if (guardsOn()) {
    const [r] = await db.select().from(s.rides).where(and(eq(s.rides.id, rideId), eq(s.rides.driverId, driverId), eq(s.rides.status, "in_progress")));
    if (r) {
      const pos = await driverPosition(db, driverId);
      const check = completeCheck(pos, { lat: r.destLat, lng: r.destLng }, r.startedAt, r.durationS, new Date(),
        { minFraction: numEnv("PRUMO_COMPLETE_MIN_FACTOR"), minFloorS: numEnv("PRUMO_COMPLETE_MIN_S") });
      if (check) {
        if (check.kind !== "far" || !pos || pos.lat === null || pos.lng === null) fail(check.message);
        const reason = opts.reason?.trim() ?? "";
        if (!reason) throw new RideError(`${check.message} Se o passageiro desceu antes, informe o motivo para encerrar assim mesmo.`, "far_from_dest");
        const reasonProblem = farCompletionReasonProblem(reason);
        if (reasonProblem) fail(reasonProblem);
        const fraction = tripFraction({ lat: r.originLat, lng: r.originLng }, { lat: r.destLat, lng: r.destLng }, { lat: pos.lat!, lng: pos.lng! });
        fare = scaleFareToTotal(r, Math.round(r.totalCents * fraction));
        review = `Encerrada longe do destino: ${reason.slice(0, 200)}`;
        far = { reason, chargedCents: fare.totalCents, estimatedCents: r.totalCents };
      }
    }
  }
  const ride = await finishTrip(rideId, { driverId, fare, review });
  if (far) {
    await audit(driverId, "ride.review_flag", "ride", rideId, { event: "completed_far", reason: far.reason, chargedCents: far.chargedCents });
    // O passageiro é avisado: o valor pode ter sido reduzido e a corrida vai para revisão da equipe.
    await notify(db, ride.passengerId, "Corrida encerrada antes do destino",
      `Sua corrida foi encerrada longe do destino. Valor cobrado: ${brl(far.chargedCents)} (estimado: ${brl(far.estimatedCents)}). A equipe vai revisar; se algo estiver errado, fale com o suporte.`, "/passageiro/viagens");
  }
  await flagAfterJump(rideId, driverId, "completed");
  return ride;
}

/**
 * Equipe encerra corrida presa em viagem, cobrando o valor estimado ou o informado, com a liquidação de sempre.
 * O motivo é obrigatório e vai para a auditoria (feita pela rota).
 */
export async function staffCloseRide(rideId: string, o: { amountCents?: number; reason: string }) {
  const db = await getDb();
  const [r] = await db.select().from(s.rides).where(eq(s.rides.id, rideId));
  if (!r) return fail("Corrida não encontrada.");
  if (!STAFF_CLOSE_FROM.includes(r.status)) fail("Só dá para encerrar uma corrida que está em viagem.");
  if (!r.driverId) fail("A corrida não tem motorista.");
  let fare: ReturnType<typeof scaleFareToTotal> | undefined;
  if (o.amountCents !== undefined && o.amountCents !== r.totalCents) {
    const problem = staffChargeProblem(o.amountCents, r.totalCents);
    if (problem) fail(problem);
    fare = scaleFareToTotal(r, o.amountCents);
  }
  const done = await finishTrip(rideId, { fare, review: `Encerrada pela equipe: ${o.reason.slice(0, 200)}` });
  // O passageiro é avisado do valor (reduzido ou não) e de que a corrida passou pela revisão da equipe.
  await notify(db, done.passengerId, "Corrida encerrada pela Orbi",
    done.totalCents < r.totalCents
      ? `A equipe encerrou sua corrida e o valor foi reduzido para ${brl(done.totalCents)} (estimado: ${brl(r.totalCents)}).`
      : `A equipe revisou e encerrou sua corrida. Valor: ${brl(done.totalCents)}.`, "/passageiro/viagens");
  return { ride: done, chargedCents: done.totalCents, estimatedCents: r.totalCents };
}

/** Equipe cancela corrida aberta (inclusive em viagem), sem cobrança. O motivo vai para a auditoria (feita pela rota). */
export async function staffCancelRide(rideId: string, reason: string) {
  const db = await getDb();
  const [done] = await db.update(s.rides).set({ status: "cancelled", cancelledBy: "staff", cancelReason: reason, endedAt: new Date() })
    .where(and(eq(s.rides.id, rideId), inArray(s.rides.status, STAFF_CANCEL_FROM))).returning();
  if (!done) return fail("Esta corrida não está aberta: não dá para cancelar.");
  await releaseCoupon(db, done);
  await db.update(s.offers).set({ status: "expired" }).where(and(eq(s.offers.rideId, rideId), eq(s.offers.status, "pending")));
  if (done.driverId) {
    await db.update(s.drivers).set({ idleSince: new Date() }).where(eq(s.drivers.userId, done.driverId));
    await notify(db, done.driverId, "Corrida cancelada pela Orbi", "A equipe cancelou esta corrida. Nada será cobrado.", "/motorista");
  }
  await notify(db, done.passengerId, "Corrida cancelada pela Orbi", "A equipe cancelou esta corrida. Nada foi cobrado.", "/passageiro/viagens");
  touchRide(done);
  return done;
}

/** Consulta o provedor e credita o motorista uma única vez quando o Pix é confirmado. */
export async function refreshPayment(rideId: string, opts: { timeoutMs?: number } = {}) {
  const db = await getDb();
  const [pay] = await db.select().from(s.payments).where(eq(s.payments.rideId, rideId));
  if (!pay || pay.status !== "pending" || !pay.externalId) return pay ?? null;
  const status = await getPixStatus(pay.externalId, opts.timeoutMs);
  if (status === "pending") return pay;
  // Pagamento, corrida e lançamentos mudam juntos: sem meio-termo se algo falhar no caminho.
  const out = await db.transaction(async (tx) => {
    const [claimed] = await tx.update(s.payments).set({ status }).where(and(eq(s.payments.id, pay.id), eq(s.payments.status, "pending"))).returning();
    if (!claimed) return null;
    const [ride] = await tx.update(s.rides).set({ paymentStatus: status }).where(eq(s.rides.id, rideId)).returning();
    if (status === "paid") await settle(tx, ride);
    return { claimed, ride };
  });
  if (out) touchRide(out.ride);
  return out?.claimed ?? pay;
}

export async function cancelRide(rideId: string, userId: string, reason: string) {
  const db = await getDb();
  const [ride] = await db.select().from(s.rides).where(eq(s.rides.id, rideId));
  if (!ride) fail("Corrida não encontrada.");
  const byPassenger = ride!.passengerId === userId;
  const byDriver = ride!.driverId === userId;
  if (!byPassenger && !byDriver) fail("Esta corrida não é sua.");

  // Motorista que desiste antes de chegar devolve o pedido à fila, sem deixar o passageiro na mão.
  if (byDriver && ride!.status === "accepted") {
    const [back] = await db.update(s.rides).set({ status: "searching", driverId: null, vehicleId: null, acceptedAt: null, searchStartedAt: new Date(), ...tariffFare(ride!) })
      .where(and(eq(s.rides.id, rideId), eq(s.rides.status, "accepted"))).returning();
    if (!back) fail("A corrida não está mais nesta etapa.");
    await db.update(s.drivers).set({ cancelsTotal: sql`${s.drivers.cancelsTotal} + 1`, idleSince: new Date() }).where(eq(s.drivers.userId, userId));
    await notify(db, ride!.passengerId, "Procurando outro motorista", "O motorista não pôde seguir. Já estamos buscando outro.", "/passageiro");
    publish(userChannel(userId), "ride");
    touchRide(back);
    await dispatchNext(db, rideId);
    return back;
  }
  const allowed: RideStatus[] = byPassenger ? ["scheduled", "searching", "accepted", "arrived"] : ["arrived"];
  const [done] = await db.update(s.rides).set({ status: "cancelled", cancelledBy: byPassenger ? "passenger" : "driver", cancelReason: reason, endedAt: new Date() })
    .where(and(eq(s.rides.id, rideId), inArray(s.rides.status, allowed))).returning();
  if (!done) fail("Esta corrida não pode mais ser cancelada.");
  await releaseCoupon(db, done!);
  await db.update(s.offers).set({ status: "expired" }).where(and(eq(s.offers.rideId, rideId), eq(s.offers.status, "pending")));
  if (done!.driverId) {
    if (byDriver) await db.update(s.drivers).set({ cancelsTotal: sql`${s.drivers.cancelsTotal} + 1` }).where(eq(s.drivers.userId, userId));
    await db.update(s.drivers).set({ idleSince: new Date() }).where(eq(s.drivers.userId, done!.driverId));
    await notify(db, byPassenger ? done!.driverId : done!.passengerId, "Corrida cancelada", reason || "A corrida foi cancelada.", byPassenger ? "/motorista" : "/passageiro");
  }
  touchRide(done!);
  return done!;
}

export async function rateRide(rideId: string, userId: string, stars: number, note?: string) {
  const db = await getDb();
  const [ride] = await db.select().from(s.rides).where(eq(s.rides.id, rideId));
  if (!ride || ride.status !== "completed") fail("Só é possível avaliar corridas concluídas.");
  // A nota entra com UPDATE condicional (campo ainda vazio): duas avaliações simultâneas não somam duas vezes na média.
  if (ride!.passengerId === userId) {
    const [done] = await db.update(s.rides).set({ driverRating: stars, driverRatingNote: note })
      .where(and(eq(s.rides.id, rideId), isNull(s.rides.driverRating))).returning({ id: s.rides.id });
    if (!done) fail("Você já avaliou esta corrida.");
    // Nota de motorista fica em drivers; a de passageiro, em users (quem é os dois tem as duas separadas).
    await db.update(s.drivers).set({ ratingSum: sql`${s.drivers.ratingSum} + ${stars}`, ratingCount: sql`${s.drivers.ratingCount} + 1` }).where(eq(s.drivers.userId, ride!.driverId!));
  } else if (ride!.driverId === userId) {
    const [done] = await db.update(s.rides).set({ passengerRating: stars })
      .where(and(eq(s.rides.id, rideId), isNull(s.rides.passengerRating))).returning({ id: s.rides.id });
    if (!done) fail("Você já avaliou esta corrida.");
    await db.update(s.users).set({ ratingSum: sql`${s.users.ratingSum} + ${stars}`, ratingCount: sql`${s.users.ratingCount} + 1` }).where(eq(s.users.id, ride!.passengerId));
  } else fail("Esta corrida não é sua.");
  touchRide(ride!);
}

// ---------------------------------------------------------------- leitura

export async function rideView(ride: typeof s.rides.$inferSelect, viewer: "passenger" | "driver" | "share" | "staff") {
  const db = await getDb();
  const [driverRow] = ride.driverId ? await db.select({ u: s.users, d: s.drivers }).from(s.users).innerJoin(s.drivers, eq(s.users.id, s.drivers.userId)).where(eq(s.users.id, ride.driverId)) : [];
  const [vehicle] = ride.vehicleId ? await db.select().from(s.vehicles).where(eq(s.vehicles.id, ride.vehicleId)) : [];
  const [passenger] = await db.select().from(s.users).where(eq(s.users.id, ride.passengerId));
  const [category] = await db.select().from(s.categories).where(eq(s.categories.id, ride.categoryId));
  const [selfie] = ride.driverId ? await db.select({ id: s.documents.id }).from(s.documents).where(and(eq(s.documents.driverId, ride.driverId), eq(s.documents.kind, "selfie"), eq(s.documents.status, "approved"))) : [];
  const first = (n: string) => n.split(" ")[0];
  const withLocation = showsDriverLocation(ride.status);
  const base = {
    id: ride.id, status: ride.status, statusLabel: STATUS_LABEL[ride.status], categoryName: category?.name,
    origin: { label: ride.originLabel, lat: ride.originLat, lng: ride.originLng },
    dest: { label: ride.destLabel, lat: ride.destLat, lng: ride.destLng },
    stops: ride.stops, scheduledFor: ride.scheduledFor,
    geometry: ride.geometry, routeSource: ride.routeSource, distanceM: ride.distanceM, durationS: ride.durationS,
    createdAt: ride.createdAt, startedAt: ride.startedAt, endedAt: ride.endedAt,
    driver: driverRow ? {
      name: first(driverRow.u.name), rating: driverRow.d.ratingCount ? driverRow.d.ratingSum / driverRow.d.ratingCount : null,
      ratingCount: driverRow.d.ratingCount, hasPhoto: !!selfie,
      // Posição vem do GPS do celular do motorista: direção, precisão e há quanto tempo chegou.
      // Só durante a corrida; depois dela (histórico, link compartilhado) a posição atual dele não é de quem vê.
      lat: withLocation ? driverRow.d.lat : null, lng: withLocation ? driverRow.d.lng : null,
      heading: withLocation ? driverRow.d.heading : null, accuracyM: withLocation ? driverRow.d.accuracyM : null,
      locationAt: withLocation ? driverRow.d.locationAt : null,
    } : null,
    vehicle: vehicle ? { make: vehicle.make, model: vehicle.model, color: vehicle.color, plate: vehicle.plate } : null,
  };
  if (viewer === "share") return base;
  const money = {
    grossCents: ride.grossCents, serviceFeeCents: ride.serviceFeeCents, discountCents: ride.discountCents, totalCents: ride.totalCents,
    paymentMethod: ride.paymentMethod, paymentStatus: ride.paymentStatus,
  };
  const messages = ACTIVE_STATUSES.includes(ride.status) && viewer !== "staff"
    ? await db.select().from(s.rideMessages).where(eq(s.rideMessages.rideId, ride.id)).orderBy(s.rideMessages.createdAt) : [];
  const [payment] = await db.select().from(s.payments).where(eq(s.payments.rideId, ride.id));
  const me = viewer === "passenger" ? ride.passengerId : ride.driverId;
  const shared = { ...base, ...money, messages: messages.map((m) => ({ id: m.id, body: m.body, mine: m.senderId === me })), pixCopyPaste: payment?.status === "pending" ? payment.pixCopyPaste : null };
  // Quem embarca, quando a corrida foi pedida para outra pessoa. O celular só aparece para o motorista enquanto a corrida está aberta.
  const riderOpen = ride.riderName && ACTIVE_STATUSES.includes(ride.status);
  if (viewer === "passenger") {
    // Pix para o motorista: a chave dele e o "copia e cola" com o valor, a partir do início da viagem e até 24 h depois do fim.
    const pixOpen = ride.paymentMethod === "pix_driver" && driverRow?.d.pixKey
      && (ride.status === "in_progress" || (ride.status === "completed" && ride.endedAt && Date.now() - ride.endedAt.getTime() < 24 * 3600_000));
    let driverPix: { key: string; keyType: string | null; payload: string; name: string } | null = null;
    if (pixOpen) {
      const [region] = await db.select({ name: s.regions.name }).from(s.regions).where(eq(s.regions.id, ride.regionId));
      driverPix = { key: driverRow!.d.pixKey!, keyType: driverRow!.d.pixKeyType, name: driverRow!.u.name, payload: pixPayload({ key: driverRow!.d.pixKey!, name: driverRow!.u.name, city: region?.name ?? "Ipatinga", amountCents: ride.totalCents, txid: `Orbi${ride.id.replace(/-/g, "").slice(0, 12)}` }) };
    }
    return { ...shared, shareToken: ride.shareToken, myRating: ride.driverRating, rider: ride.riderName ? { name: ride.riderName, phone: ride.riderPhone } : null, driverPix };
  }
  const driverExtra = {
    commissionBps: ride.commissionBps, commissionCents: ride.commissionCents, driverNetCents: ride.driverNetCents,
    rider: riderOpen && viewer === "driver" ? { name: ride.riderName!, phone: ride.riderPhone } : ride.riderName ? { name: first(ride.riderName), phone: null } : null,
    passenger: { name: first(passenger.name), rating: passenger.ratingCount ? passenger.ratingSum / passenger.ratingCount : null, ratingCount: passenger.ratingCount },
    myRating: ride.passengerRating,
  };
  return { ...shared, ...driverExtra };
}

/**
 * Vista enxuta para listas (histórico do passageiro e do motorista, painel): o mesmo formato de rideView, mas sem trajeto
 * (geometry vazio), chat, posição ao vivo, foto e Pix do motorista. Motorista, veículo, categoria e passageiro vêm em lote
 * (uma consulta por tabela para a página inteira, sem N+1). A corrida em andamento continua usando rideView, a vista completa.
 */
export async function rideSummaries(list: (typeof s.rides.$inferSelect)[], viewer: "passenger" | "driver" | "staff") {
  if (!list.length) return [];
  const db = await getDb();
  const uniq = <T,>(xs: (T | null)[]) => [...new Set(xs.filter((x): x is T => x !== null))];
  const driverIds = uniq(list.map((r) => r.driverId));
  const vehicleIds = uniq(list.map((r) => r.vehicleId));
  const categoryIds = uniq(list.map((r) => r.categoryId));
  const passengerIds = viewer === "passenger" ? [] : uniq(list.map((r) => r.passengerId));
  const [drivers, vehicles, categories, passengers] = await Promise.all([
    driverIds.length ? db.select({ id: s.users.id, name: s.users.name, ratingSum: s.drivers.ratingSum, ratingCount: s.drivers.ratingCount }).from(s.users).innerJoin(s.drivers, eq(s.users.id, s.drivers.userId)).where(inArray(s.users.id, driverIds)) : [],
    vehicleIds.length ? db.select().from(s.vehicles).where(inArray(s.vehicles.id, vehicleIds)) : [],
    db.select({ id: s.categories.id, name: s.categories.name }).from(s.categories).where(inArray(s.categories.id, categoryIds)),
    passengerIds.length ? db.select({ id: s.users.id, name: s.users.name, ratingSum: s.users.ratingSum, ratingCount: s.users.ratingCount }).from(s.users).where(inArray(s.users.id, passengerIds)) : [],
  ]);
  const dMap = new Map(drivers.map((d) => [d.id, d]));
  const vMap = new Map(vehicles.map((v) => [v.id, v]));
  const cMap = new Map(categories.map((c) => [c.id, c.name]));
  const pMap = new Map(passengers.map((p) => [p.id, p]));
  const first = (n: string) => n.split(" ")[0];
  return list.map((ride) => {
    const d = ride.driverId ? dMap.get(ride.driverId) : undefined;
    const v = ride.vehicleId ? vMap.get(ride.vehicleId) : undefined;
    const base = {
      id: ride.id, status: ride.status, statusLabel: STATUS_LABEL[ride.status], categoryName: cMap.get(ride.categoryId),
      origin: { label: ride.originLabel, lat: ride.originLat, lng: ride.originLng },
      dest: { label: ride.destLabel, lat: ride.destLat, lng: ride.destLng },
      stops: ride.stops, scheduledFor: ride.scheduledFor,
      geometry: [] as [number, number][], routeSource: ride.routeSource, distanceM: ride.distanceM, durationS: ride.durationS,
      createdAt: ride.createdAt, startedAt: ride.startedAt, endedAt: ride.endedAt,
      driver: d ? { name: first(d.name), rating: d.ratingCount ? d.ratingSum / d.ratingCount : null, ratingCount: d.ratingCount, hasPhoto: false, lat: null, lng: null, heading: null, accuracyM: null, locationAt: null } : null,
      vehicle: v ? { make: v.make, model: v.model, color: v.color, plate: v.plate } : null,
      grossCents: ride.grossCents, serviceFeeCents: ride.serviceFeeCents, discountCents: ride.discountCents, totalCents: ride.totalCents,
      paymentMethod: ride.paymentMethod, paymentStatus: ride.paymentStatus,
      messages: [] as { id: string; body: string; mine: boolean }[], pixCopyPaste: null as string | null,
    };
    if (viewer === "passenger") return { ...base, shareToken: ride.shareToken, myRating: ride.driverRating, rider: ride.riderName ? { name: ride.riderName, phone: ride.riderPhone } : null, driverPix: null };
    const p = pMap.get(ride.passengerId);
    const common = {
      ...base, commissionBps: ride.commissionBps, commissionCents: ride.commissionCents, driverNetCents: ride.driverNetCents,
      rider: ride.riderName ? { name: first(ride.riderName), phone: null } : null,
      passenger: p ? { name: first(p.name), rating: p.ratingCount ? p.ratingSum / p.ratingCount : null, ratingCount: p.ratingCount } : { name: "", rating: null, ratingCount: 0 },
      myRating: ride.passengerRating,
    };
    return viewer === "staff" ? { ...common, cancelReason: ride.cancelReason, reviewReason: ride.reviewReason } : common; // motivo de revisão: só a equipe
  });
}

export async function activeRideFor(userId: string, as: "passenger" | "driver") {
  const db = await getDb();
  const owner = as === "passenger" ? s.rides.passengerId : s.rides.driverId;
  const [ride] = await db.select().from(s.rides).where(and(eq(owner, userId), inArray(s.rides.status, ACTIVE_STATUSES))).orderBy(desc(s.rides.createdAt)).limit(1);
  return ride ?? null;
}
