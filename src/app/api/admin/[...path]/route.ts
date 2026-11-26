import fs from "node:fs/promises";
import path from "node:path";
import { DEFAULT_SCHEDULE } from "@/shared/schedule";
import { DEFAULT_PAYMENT_RULES } from "@/shared/payment-methods";
import { withDefaultRules, DEFAULT_DRIVER_RULES, DOC_INFO, DOC_KINDS, type DriverRules } from "@/shared/driver-rules";
import { and, desc, eq, gte, inArray, isNull, lt, ne, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { dataDir, getDb, schema as s } from "@/database";
import { getSetting } from "@/database/seed";
import { ApiError, assertCan, audit, body, requireStepUp, requireUuid, route } from "@/backend/api";
import { cpfHmac, hashPassword, revokeSessions } from "@/backend/auth";
import { randomBytes } from "node:crypto";
import { fileHeaders } from "@/backend/security";
import { inviteStaff } from "@/backend/invites";
import { rateLimitDb } from "@/backend/rate-limit-db";
import { alertAdmins } from "@/backend/access";
import { userChangeNeedsStepUp } from "@/shared/step-up";
import { emailDomainExists } from "@/backend/verify";
import { cancelScheduledRides, notify, rideSummaries, staffCancelRide, staffCloseRide } from "@/backend/rides";
import { nextRideCursor, pageParams, ridesBefore, ridesOrder } from "@/backend/pagination";
import { dayEndSp, dayLabelSp, dayStartSp } from "@/backend/sql-time";
import { isIsoDay } from "@/shared/iso-day";
import { staffChargeProblem } from "@/shared/ride-resolution";
import { resolveSettlement, settleWithdrawal } from "@/backend/driver-finance";
import { debtLimitCents, orbiPix } from "@/backend/debt";
import { debtLevel } from "@/shared/debt";
import { publish, STAFF_CHANNEL, userChannel } from "@/backend/bus";
import { STAFF } from "@/shared/permissions";
import { canSeeFullPii, maskCnhValue, maskCpfValue, staffUserView } from "@/shared/account";
import { DEFAULT_WEIGHTS } from "@/shared/dispatch";
import { brl } from "@/shared/pricing";
import { isValidCpf } from "@/shared/validation";

type P = { path: string[] };
const roles = { roles: STAFF };
const count = sql<number>`count(*)::int`;

export const GET = route<P>(async ({ req, user, params }) => {
  const db = await getDb();
  const [what, arg, sub] = params.path;
  const url = new URL(req.url);

  switch (what) {
    case "dashboard": {
      assertCan(user, "dashboard", "read");
      const [drivers, online, passengers, rides, cancelled, pendingDrivers, openTickets, money, unreviewed, pendingWithdrawals] = await Promise.all([
        db.select({ n: count }).from(s.drivers),
        db.select({ n: count }).from(s.drivers).where(eq(s.drivers.online, true)),
        db.select({ n: count }).from(s.users).where(and(eq(s.users.role, "passenger"), eq(s.users.status, "active"))),
        db.select({ n: count }).from(s.rides).where(eq(s.rides.status, "completed")),
        db.select({ n: count }).from(s.rides).where(eq(s.rides.status, "cancelled")),
        db.select({ n: count }).from(s.drivers).where(eq(s.drivers.status, "pending")),
        db.select({ n: count }).from(s.tickets).where(ne(s.tickets.status, "closed")),
        db.select({
          gross: sql<number>`coalesce(sum(${s.rides.grossCents}),0)::int`, commission: sql<number>`coalesce(sum(${s.rides.commissionCents}),0)::int`,
          fees: sql<number>`coalesce(sum(${s.rides.serviceFeeCents}),0)::int`, discounts: sql<number>`coalesce(sum(${s.rides.discountCents}),0)::int`,
        }).from(s.rides).where(eq(s.rides.status, "completed")),
        db.select({ n: count }).from(s.tariffs).where(isNull(s.tariffs.reviewedAt)),
        db.select({ n: count }).from(s.withdrawals).where(eq(s.withdrawals.status, "requested")),
      ]);
      const daily = await db.select({
        day: dayLabelSp(s.rides.endedAt), rides: count, gross: sql<number>`coalesce(sum(${s.rides.grossCents}),0)::int`,
      }).from(s.rides).where(and(eq(s.rides.status, "completed"), gte(s.rides.endedAt, sql`now() - interval '14 days'`))).groupBy(sql`1`).orderBy(sql`1`);
      const [openEmergencies] = await db.select({ n: count }).from(s.emergencies).where(isNull(s.emergencies.reviewedAt));
      return {
        openEmergencies: openEmergencies.n,
        drivers: drivers[0].n, driversOnline: online[0].n, passengers: passengers[0].n, ridesCompleted: rides[0].n, ridesCancelled: cancelled[0].n,
        pendingDrivers: pendingDrivers[0].n, openTickets: openTickets[0].n, pendingWithdrawals: pendingWithdrawals[0].n,
        grossCents: money[0].gross, commissionCents: money[0].commission, feesCents: money[0].fees, discountsCents: money[0].discounts,
        tariffsUnreviewed: unreviewed[0].n, daily,
      };
    }
    case "users": {
      assertCan(user, "users", "read");
      const rows = await db.select().from(s.users).orderBy(desc(s.users.createdAt)).limit(300);
      return { rows: rows.map((u) => staffUserView(u, canSeeFullPii(user.role))) };
    }
    case "drivers": {
      assertCan(user, "drivers", "read");
      const rows = await db.select({ d: s.drivers, u: s.users }).from(s.drivers).innerJoin(s.users, eq(s.drivers.userId, s.users.id)).orderBy(desc(s.users.createdAt)).limit(300);
      const fullPii = canSeeFullPii(user.role);
      const ids = rows.map((r) => r.d.userId);
      const [docs, vehicles] = ids.length ? await Promise.all([
        db.select().from(s.documents).where(inArray(s.documents.driverId, ids)).orderBy(desc(s.documents.createdAt)),
        db.select().from(s.vehicles).where(inArray(s.vehicles.driverId, ids)),
      ]) : [[], []];
      return { rows: rows.map(({ d, u }) => ({
        id: d.userId, name: u.name, email: u.email, phone: u.phone, status: d.status, online: d.online, piiMasked: !fullPii, cpf: fullPii ? d.cpf : maskCpfValue(d.cpf), cnh: fullPii ? d.cnh : maskCnhValue(d.cnh), ridesTotal: d.ridesTotal,
        address: d.addressCep ? `${d.addressStreet}, ${d.addressNumber}${d.addressComplement ? ` (${d.addressComplement})` : ""} · ${d.addressDistrict} · ${d.addressCity}/${d.addressState} · CEP ${d.addressCep}` : null, addressVerified: d.addressVerified,
        rating: d.ratingCount ? d.ratingSum / d.ratingCount : null, reviewNote: d.reviewNote,
        birthDate: d.birthDate, cnhCategory: d.cnhCategory, cnhFirstLicenseAt: d.cnhFirstLicenseAt, cnhExpiresAt: d.cnhExpiresAt, cnhEar: d.cnhEar,
        inss: !!d.inssDeclaredAt, termsVersion: d.termsVersion, termsAcceptedAt: d.termsAcceptedAt,
        docs: docs.filter((x) => x.driverId === d.userId).map((x) => ({ id: x.id, kind: x.kind, status: x.status })),
        vehicles: vehicles.filter((x) => x.driverId === d.userId),
      })) };
    }
    case "vehicles": {
      assertCan(user, "vehicles", "read");
      const rows = await db.select({ v: s.vehicles, driver: s.users.name, category: s.categories.name }).from(s.vehicles)
        .innerJoin(s.users, eq(s.vehicles.driverId, s.users.id)).innerJoin(s.categories, eq(s.vehicles.categoryId, s.categories.id)).orderBy(desc(s.vehicles.createdAt)).limit(300);
      return { rows: rows.map((r) => ({ ...r.v, driverName: r.driver, categoryName: r.category })) };
    }
    case "documents": {
      assertCan(user, "documents", "read");
      if (arg && sub === "file") {
        requireUuid(arg, "Documento não encontrado.");
        const [doc] = await db.select().from(s.documents).where(eq(s.documents.id, arg));
        if (!doc) throw new ApiError(404, "Documento não encontrado.");
        await audit(user.id, "document.view", "document", doc.id);
        const file = await fs.readFile(path.join(dataDir(), "uploads", doc.storedName));
        // Documento de usuário: entregue isolado (sem rodar nada no site), nunca guardado em cache.
        return new NextResponse(file, { headers: fileHeaders(doc.mime, { "Cache-Control": "private, no-store", "Content-Disposition": `inline; filename="documento-${doc.kind}"` }) });
      }
      throw new ApiError(404, "Recurso não encontrado.");
    }
    case "rides": {
      assertCan(user, "rides", "read");
      // Lista enxuta, paginada e em lote (sem trajeto, chat nem posição ao vivo).
      const { limit, before } = pageParams(req, 200, 200);
      const rows = await db.select().from(s.rides).where(ridesBefore(before)).orderBy(...ridesOrder()).limit(limit + 1);
      const page = rows.slice(0, limit);
      return { rows: await rideSummaries(page, "staff"), nextBefore: nextRideCursor(page, rows.length > limit) };
    }
    case "payments": {
      assertCan(user, "payments", "read");
      const [payments, withdrawals] = await Promise.all([
        db.select().from(s.payments).orderBy(desc(s.payments.createdAt)).limit(200),
        db.select({ w: s.withdrawals, name: s.users.name }).from(s.withdrawals).innerJoin(s.users, eq(s.withdrawals.driverId, s.users.id)).orderBy(desc(s.withdrawals.createdAt)).limit(200),
      ]);
      const settlements = await db.select({ x: s.debtSettlements, name: s.users.name }).from(s.debtSettlements).innerJoin(s.users, eq(s.debtSettlements.driverId, s.users.id)).orderBy(desc(s.debtSettlements.createdAt)).limit(200);
      return { payments, withdrawals: withdrawals.map((r) => ({ ...r.w, driverName: r.name })), settlements: settlements.map((r) => ({ ...r.x, driverName: r.name })) };
    }
    case "emergencies": {
      assertCan(user, "tickets", "read");
      const rows = await db.select({ e: s.emergencies, name: s.users.name, origin: s.rides.originLabel, originLat: s.rides.originLat, originLng: s.rides.originLng, dest: s.rides.destLabel, status: s.rides.status })
        .from(s.emergencies).innerJoin(s.users, eq(s.emergencies.triggeredBy, s.users.id)).innerJoin(s.rides, eq(s.emergencies.rideId, s.rides.id))
        .orderBy(desc(s.emergencies.createdAt)).limit(200);
      return { rows: rows.map((r) => ({ ...r.e, userName: r.name, originLabel: r.origin, originLat: r.originLat, originLng: r.originLng, destLabel: r.dest, rideStatus: r.status })) };
    }
    case "tickets": {
      assertCan(user, "tickets", "read");
      const rows = await db.select({ t: s.tickets, name: s.users.name }).from(s.tickets).innerJoin(s.users, eq(s.tickets.userId, s.users.id)).orderBy(desc(s.tickets.createdAt)).limit(200);
      return { rows: rows.map((r) => ({ ...r.t, userName: r.name })) };
    }
    case "reports": {
      assertCan(user, "reports", "read");
      const from = url.searchParams.get("from");
      const to = url.searchParams.get("to");
      // Dias em horário de Brasília: de 00:00 do primeiro dia até o fim do último (início do dia seguinte, exclusivo).
      if ((from && !isIsoDay(from)) || (to && !isIsoDay(to))) throw new ApiError(400, "Data inválida. Use o formato AAAA-MM-DD.");
      const fromCond = sql`${s.rides.endedAt} >= ${from ? dayStartSp(from) : sql`now() - interval '30 days'`}`;
      const toCond = to ? sql`${s.rides.endedAt} < ${dayEndSp(to)}` : sql`${s.rides.endedAt} <= now()`;
      const rows = await db.select({
        day: dayLabelSp(s.rides.endedAt), rides: count,
        gross: sql<number>`sum(${s.rides.grossCents})::int`, commission: sql<number>`sum(${s.rides.commissionCents})::int`,
        fees: sql<number>`sum(${s.rides.serviceFeeCents})::int`, discounts: sql<number>`sum(${s.rides.discountCents})::int`, net: sql<number>`sum(${s.rides.driverNetCents})::int`,
      }).from(s.rides).where(and(eq(s.rides.status, "completed"), fromCond, toCond)).groupBy(sql`1`).orderBy(sql`1`);
      if (url.searchParams.get("format") === "csv") {
        const csv = ["dia;corridas;bruto;comissao;taxas;descontos;liquido_motoristas", ...rows.map((r) => [r.day, r.rides, r.gross, r.commission, r.fees, r.discounts, r.net].map((v, i) => (i < 2 ? v : (Number(v) / 100).toFixed(2).replace(".", ","))).join(";"))].join("\n");
        await audit(user.id, "report.export", "report");
        return new NextResponse(`﻿${csv}`, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="relatorio-orbi.csv"' } });
      }
      return { rows };
    }
    case "settings": {
      assertCan(user, "settings", "read");
      return {
        dispatchWeights: await getSetting(db, "dispatchWeights", DEFAULT_WEIGHTS),
        dispatch: await getSetting(db, "dispatch", { offerTimeoutS: 20, searchTimeoutS: 180 }),
        withdrawal: await getSetting(db, "withdrawal", { minCents: 2000 }),
        debt: { limitCents: await debtLimitCents(db) },
        orbiPix: await orbiPix(db),
        schedule: await getSetting(db, "schedule", DEFAULT_SCHEDULE),
        support: await getSetting(db, "support", { whatsapp: "" }),
        payments: await getSetting(db, "payments", DEFAULT_PAYMENT_RULES),
        driverRules: await getSetting<Partial<DriverRules>>(db, "driverRules", DEFAULT_DRIVER_RULES).then(withDefaultRules),
      };
    }
    case "me": return { role: user.role };
    default: throw new ApiError(404, "Recurso não encontrado.");
  }
}, roles);

const reviewSchema = z.object({ status: z.enum(["approved", "rejected", "pending", "suspended"]), note: z.string().trim().max(500).optional() });
const docReviewSchema = z.object({ status: z.enum(["approved", "rejected"]), note: z.string().trim().max(500).optional() });
const vehicleReviewSchema = z.object({ status: z.enum(["approved", "rejected"]) });
const userStatusSchema = z.object({ status: z.enum(["active", "suspended"]) });
const ticketSchema = z.object({ status: z.enum(["open", "in_progress", "closed"]).optional(), response: z.string().trim().max(4000).optional() });
const emergencyReviewSchema = z.object({ note: z.string().trim().min(3, "Escreva uma nota sobre a análise.").max(2000) });
const withdrawalSchema = z.object({ status: z.enum(["paid", "rejected"]) });
const settlementSchema = z.object({ status: z.enum(["confirmed", "rejected"]), reason: z.string().trim().max(300).optional() });
// Resolver corrida presa: o motivo é obrigatório e vai para a auditoria. Encerrar cobra o valor estimado ou o informado (em centavos).
const rideResolveSchema = z.object({ reason: z.string().trim().min(5, "Escreva o motivo (pelo menos 5 caracteres).").max(300), amountCents: z.number().int().positive().optional() });
// Quem cria a conta NÃO escolhe a senha: a pessoa recebe um convite por e-mail e define a própria senha (e ativa a segunda etapa).
const staffSchema = z.object({
  name: z.string().trim().min(3, "Informe o nome.").max(80, "O nome pode ter até 80 caracteres."), email: z.string().trim().toLowerCase().email("E-mail inválido."),
  role: z.enum(["admin", "gestor", "atendente"]),
});
const positive = z.number().min(0).max(1000);
const settingsSchema = z.object({
  dispatchWeights: z.object({ eta: positive, idle: positive, netPerKm: positive, earningsBalance: positive, acceptance: positive, cancellation: positive, rating: positive }).optional(),
  dispatch: z.object({ offerTimeoutS: z.number().int().min(5).max(120), searchTimeoutS: z.number().int().min(30).max(900) }).optional(),
  withdrawal: z.object({ minCents: z.number().int().min(0) }).optional(),
  // Limite da dívida do motorista com a Orbi (centavos) e a chave Pix onde ele paga.
  debt: z.object({ limitCents: z.number().int().min(100, "O limite mínimo é R$ 1,00.").max(1_000_000) }).optional(),
  orbiPix: z.object({ key: z.string().trim().max(120), name: z.string().trim().max(80) }).optional(),
  schedule: z.object({ minLeadMin: z.number().int().min(0).max(1440), maxDays: z.number().int().min(1).max(60), searchLeadMin: z.number().int().min(0).max(120), maxPerPassenger: z.number().int().min(1).max(20) }).optional(),
  // Formas de pagamento direto ao motorista que o passageiro pode escolher.
  payments: z.object({ cash: z.boolean(), pix_driver: z.boolean(), card_machine: z.boolean() }).refine((v) => v.cash || v.pix_driver || v.card_machine, "Deixe pelo menos uma forma de pagamento ligada.").optional(),
  // Requisitos do motorista (idade, habilitação, carro e documentos obrigatórios).
  driverRules: z.object({
    minAge: z.number().int().min(18, "A idade mínima legal para dirigir é 18 anos.").max(70),
    minLicenseYears: z.number().int().min(0).max(20),
    maxVehicleAge: z.number().int().min(1).max(40),
    minDoors: z.number().int().min(2).max(5),
    minSeats: z.number().int().min(2).max(9),
    requireAirConditioning: z.boolean(),
    requiredDocs: z.array(z.enum(DOC_KINDS)).refine((d) => d.includes("cnh") && d.includes("crlv"), "CNH e CRLV são sempre obrigatórios (Lei 13.640/2018)."),
    motoMinLicenseYears: z.number().int().min(2, "A lei do mototaxista pede pelo menos 2 anos na categoria A.").max(20).default(2),
    maxMotoAge: z.number().int().min(1).max(30).default(10),
  }).optional(),
  // WhatsApp do atendimento, mostrado na central de ajuda do site. Vazio: o botão não aparece.
  support: z.object({ whatsapp: z.string().transform((v) => v.replace(/\D/g, "")).pipe(z.string().regex(/^(|55[1-9]{2}9?\d{8})$/, "WhatsApp com 55, DDD e número, por exemplo 5531999999999.")) }).optional(),
});

export const POST = route<P>(async ({ req, user, session, params }) => {
  const db = await getDb();
  const [what, id, sub] = params.path;
  if (["drivers", "documents", "vehicles", "users", "tickets", "emergencies", "withdrawals", "settlements", "rides", "pii"].includes(what)) requireUuid(id);
  switch (what) {
    // "Revelar" CPF e CNH inteiros de uma conta (o atendente os vê mascarados na lista). Cada consulta fica na auditoria e tem limite por hora.
    case "pii": {
      assertCan(user, "users", "read");
      if (!(await rateLimitDb(`pii:${user.id}`, 30, 60 * 60_000))) throw new ApiError(429, "Muitas consultas de CPF em pouco tempo. Aguarde um pouco.");
      const [u] = await db.select({ cpf: s.users.cpf }).from(s.users).where(eq(s.users.id, id));
      if (!u) throw new ApiError(404, "Conta não encontrada.");
      const [d] = await db.select({ cpf: s.drivers.cpf, cnh: s.drivers.cnh }).from(s.drivers).where(eq(s.drivers.userId, id));
      await audit(user.id, "user.cpf_view", "user", id, { cnh: !!d?.cnh });
      return { cpf: u.cpf ?? d?.cpf ?? null, cnh: d?.cnh ?? null };
    }
    case "drivers": {
      assertCan(user, "drivers", "write");
      const v = await body(req, reviewSchema);
      if (v.status === "approved") {
        const docs = await db.select().from(s.documents).where(eq(s.documents.driverId, id)).orderBy(desc(s.documents.createdAt));
        const rules = await getSetting<Partial<DriverRules>>(db, "driverRules", DEFAULT_DRIVER_RULES).then(withDefaultRules);
        // Quem cadastrou moto precisa também do certificado do curso de mototaxista (Resolução CONTRAN 930/2022).
        const motoVehicles = await db.select({ id: s.vehicles.id }).from(s.vehicles).innerJoin(s.categories, eq(s.vehicles.categoryId, s.categories.id))
          .where(and(eq(s.vehicles.driverId, id), eq(s.categories.modalityId, "corrida-moto")));
        const needed = motoVehicles.length && !rules.requiredDocs.includes("curso_mototaxi") ? [...rules.requiredDocs, "curso_mototaxi" as const] : rules.requiredDocs;
        const missing = needed.filter((kind) => docs.find((d) => d.kind === kind)?.status !== "approved");
        if (missing.length) throw new ApiError(409, `Aprove primeiro: ${missing.map((k) => DOC_INFO[k].label).join(", ")}.`);
        const [drv] = await db.select().from(s.drivers).where(eq(s.drivers.userId, id));
        if (drv && !drv.termsAcceptedAt) throw new ApiError(409, "O motorista ainda não aceitou o termo de adesão.");
      }
      const [row] = await db.update(s.drivers).set({ status: v.status, reviewNote: v.note ?? null, ...(v.status !== "approved" ? { online: false } : {}) }).where(eq(s.drivers.userId, id)).returning();
      if (!row) throw new ApiError(404, "Motorista não encontrado.");
      if (v.status === "approved") await db.update(s.modalityEnrollments).set({ status: "approved" }).where(eq(s.modalityEnrollments.driverId, id));
      await audit(user.id, `driver.${v.status}`, "driver", id, { note: v.note });
      const message = { approved: ["Cadastro aprovado", "Você já pode ficar online."], rejected: ["Cadastro não aprovado", v.note || "Veja os detalhes no aplicativo."], suspended: ["Cadastro suspenso", v.note || "Fale com o atendimento."], pending: ["Cadastro em análise", "Vamos revisar seus dados."] }[v.status];
      await notify(db, id, message[0], message[1], "/motorista");
      publish(userChannel(id), "driver");
      return { ok: true };
    }
    case "documents": {
      assertCan(user, "documents", "write");
      const v = await body(req, docReviewSchema);
      const [row] = await db.update(s.documents).set({ status: v.status, reviewNote: v.note ?? null, reviewedBy: user.id }).where(eq(s.documents.id, id)).returning();
      if (!row) throw new ApiError(404, "Documento não encontrado.");
      await audit(user.id, `document.${v.status}`, "document", id);
      if (v.status === "rejected") await notify(db, row.driverId, "Documento recusado", v.note || "Envie o documento de novo.", "/motorista");
      publish(userChannel(row.driverId), "driver");
      return { ok: true };
    }
    case "vehicles": {
      assertCan(user, "vehicles", "write");
      const v = await body(req, vehicleReviewSchema);
      const [row] = await db.update(s.vehicles).set({ status: v.status }).where(eq(s.vehicles.id, id)).returning();
      if (!row) throw new ApiError(404, "Veículo não encontrado.");
      await audit(user.id, `vehicle.${v.status}`, "vehicle", id);
      publish(userChannel(row.driverId), "driver");
      return { ok: true };
    }
    case "users": {
      assertCan(user, "users", "write");
      const v = await body(req, userStatusSchema);
      if (id === user.id) throw new ApiError(409, "Você não pode suspender a própria conta.");
      const [target] = await db.select({ role: s.users.role }).from(s.users).where(eq(s.users.id, id));
      if (!target) throw new ApiError(404, "Conta não encontrada.");
      // Só administrador mexe em conta da equipe: um gestor não suspende quem está acima dele.
      if (STAFF.includes(target.role) && user.role !== "admin") throw new ApiError(403, "Só um administrador altera contas da equipe.");
      // Suspender (ou mexer em conta da equipe) pede reautenticação recente.
      if (userChangeNeedsStepUp(target.role, v.status)) requireStepUp(session);
      await db.update(s.users).set({ status: v.status }).where(eq(s.users.id, id));
      if (v.status === "suspended") {
        await db.update(s.drivers).set({ online: false }).where(eq(s.drivers.userId, id));
        // Conta suspensa não viaja: as corridas agendadas dela são canceladas (sem cobrança) e o cupom volta.
        await cancelScheduledRides(id, "Conta suspensa");
        await revokeSessions(id);
      }
      await audit(user.id, `user.${v.status}`, "user", id);
      return { ok: true };
    }
    // CPF usado por outra pessoa (o cadastro não liga o número ao titular): o administrador libera o CPF
    // de uma conta de passageiro, depois de conferir os documentos do titular pelo atendimento.
    case "cpf-release": {
      assertCan(user, "users", "write");
      if (user.role !== "admin") throw new ApiError(403, "Só um administrador libera CPF.");
      requireStepUp(session);
      const v = await body(req, z.object({ cpf: z.string().transform((x) => x.replace(/\D/g, "")).refine(isValidCpf, "CPF inválido."), note: z.string().trim().min(3, "Diga o motivo (por exemplo, o número do chamado).").max(500) }));
      const [driver] = await db.select({ id: s.drivers.userId }).from(s.drivers).where(eq(s.drivers.cpf, v.cpf));
      if (driver) throw new ApiError(409, "Este CPF está num cadastro de motorista. Revise o cadastro em Motoristas.");
      const [holder] = await db.select({ id: s.users.id, role: s.users.role }).from(s.users).where(eq(s.users.cpf, v.cpf));
      if (!holder) throw new ApiError(404, "Nenhuma conta usa este CPF.");
      if (holder.role !== "passenger") throw new ApiError(409, "Só o CPF de conta de passageiro é liberado por aqui.");
      await db.update(s.users).set({ cpf: null }).where(eq(s.users.id, holder.id));
      await audit(user.id, "user.cpf_release", "user", holder.id, { note: v.note });
      await notify(db, holder.id, "CPF removido da conta", "O CPF desta conta foi contestado pelo titular e removido. Fale com o atendimento se for um engano.");
      return { ok: true };
    }
    // Libera o bloqueio de 180 dias do CPF de motorista excluído (deleted_cpf_blocks), para a pessoa poder voltar a ser motorista.
    // Só administrador, com motivo obrigatório; o CPF não vai para a auditoria (só o motivo).
    case "cpf-block-release": {
      assertCan(user, "users", "write");
      if (user.role !== "admin") throw new ApiError(403, "Só um administrador libera o bloqueio de CPF.");
      requireStepUp(session);
      const v = await body(req, z.object({ cpf: z.string().transform((x) => x.replace(/\D/g, "")).refine(isValidCpf, "CPF inválido."), note: z.string().trim().min(5, "Diga o motivo (pelo menos 5 caracteres).").max(500) }));
      const removed = await db.delete(s.deletedCpfBlocks).where(eq(s.deletedCpfBlocks.cpfHmac, cpfHmac(v.cpf))).returning({ h: s.deletedCpfBlocks.cpfHmac });
      if (!removed.length) throw new ApiError(404, "Este CPF não tem bloqueio de motorista.");
      await audit(user.id, "user.cpf_block_release", "cpf_block", null, { note: v.note });
      return { ok: true };
    }
    case "staff": {
      assertCan(user, "staff", "write");
      requireStepUp(session);
      const v = await body(req, staffSchema);
      if (!(await emailDomainExists(v.email))) throw new ApiError(400, "Este e-mail não pode receber mensagens. Confira o que digitou.");
      const [dup] = await db.select({ id: s.users.id }).from(s.users).where(eq(s.users.email, v.email));
      if (dup) throw new ApiError(409, "Já existe uma conta com este e-mail.");
      // A conta nasce com uma senha aleatória que ninguém conhece; a pessoa define a dela pelo convite (24 h, uso único).
      const [row] = await db.insert(s.users).values({ name: v.name, email: v.email, role: v.role, passwordHash: await hashPassword(randomBytes(32).toString("base64url")), privacyAcceptedAt: new Date() }).returning();
      try { await inviteStaff(row.id, user.id, { name: v.name, email: v.email, role: v.role }); }
      catch (e) { await db.delete(s.users).where(eq(s.users.id, row.id)); throw e; }
      await audit(user.id, "staff.create", "user", row.id, { role: v.role, invited: true });
      await alertAdmins("Nova conta da equipe criada", `${user.name} criou uma conta da equipe (${v.role}) para ${v.name} (${v.email}). O convite vale por 24 horas.\nSe você não esperava isto, confira o Histórico e suspenda a conta.`);
      return { id: row.id, invited: true };
    }
    // Corrida presa: a equipe encerra (cobra o estimado ou o valor informado) ou cancela (sem cobrança). Admin e gestor.
    case "rides": {
      assertCan(user, "rides", "write");
      const v = await body(req, rideResolveSchema);
      if (sub === "close") {
        if (v.amountCents !== undefined) {
          const [r] = await db.select({ totalCents: s.rides.totalCents }).from(s.rides).where(eq(s.rides.id, id));
          if (!r) throw new ApiError(404, "Corrida não encontrada.");
          const problem = staffChargeProblem(v.amountCents, r.totalCents);
          if (problem) throw new ApiError(400, problem);
        }
        const out = await staffCloseRide(id, { amountCents: v.amountCents, reason: v.reason });
        await audit(user.id, "ride.staff_close", "ride", id, { reason: v.reason, chargedCents: out.chargedCents, estimatedCents: out.estimatedCents });
        return { ok: true, chargedCents: out.chargedCents };
      }
      if (sub === "cancel") {
        if (v.amountCents !== undefined) throw new ApiError(400, "Cancelar não cobra: não informe valor.");
        await staffCancelRide(id, v.reason);
        await audit(user.id, "ride.staff_cancel", "ride", id, { reason: v.reason });
        return { ok: true };
      }
      throw new ApiError(404, "Ação desconhecida.");
    }
    case "emergencies": {
      assertCan(user, "tickets", "write");
      const v = await body(req, emergencyReviewSchema);
      // Só analisa uma vez: o UPDATE exige alerta ainda aberto, e uma segunda análise não sobrescreve a primeira.
      const [row] = await db.update(s.emergencies).set({ reviewedAt: new Date(), reviewedBy: user.id, reviewNote: v.note }).where(and(eq(s.emergencies.id, id), isNull(s.emergencies.reviewedAt))).returning();
      if (!row) {
        const [exists] = await db.select({ id: s.emergencies.id }).from(s.emergencies).where(eq(s.emergencies.id, id));
        throw new ApiError(exists ? 409 : 404, exists ? "Esta ocorrência já foi analisada." : "Ocorrência não encontrada.");
      }
      if (row.ticketId) await db.update(s.tickets).set({ status: "closed", assignedTo: user.id }).where(eq(s.tickets.id, row.ticketId));
      await audit(user.id, "emergency.review", "emergency", id);
      publish(STAFF_CHANNEL, "emergency");
      return row;
    }
    case "tickets": {
      assertCan(user, "tickets", "write");
      const v = await body(req, ticketSchema);
      const [row] = await db.update(s.tickets).set({ ...v, assignedTo: user.id }).where(eq(s.tickets.id, id)).returning();
      if (!row) throw new ApiError(404, "Chamado não encontrado.");
      await audit(user.id, "ticket.update", "ticket", id, { status: v.status });
      if (v.response) await notify(db, row.userId, "Resposta do atendimento", row.subject);
      return row;
    }
    case "withdrawals": {
      assertCan(user, "payments", "write");
      requireStepUp(session);
      const v = await body(req, withdrawalSchema);
      // Transação com trava do motorista; pagar com saldo negativo é recusado (ver settleWithdrawal).
      const row = await settleWithdrawal(id, v.status, user.id);
      await audit(user.id, `withdrawal.${v.status}`, "withdrawal", id, { amountCents: row.amountCents });
      await notify(db, row.driverId, v.status === "paid" ? "Saque pago" : "Saque recusado", `Valor: ${brl(row.amountCents)}`, "/motorista/ganhos");
      return { ok: true };
    }
    case "settlements": {
      assertCan(user, "payments", "write");
      requireStepUp(session);
      const v = await body(req, settlementSchema);
      const { settlement, balanceCents } = await resolveSettlement(id, v, user.id);
      await audit(user.id, `debt.settlement_${v.status}`, "debt_settlement", id, { driverId: settlement.driverId, amountCents: settlement.amountCents, reason: v.reason });
      const limit = await debtLimitCents(db);
      const unblocked = v.status === "confirmed" && debtLevel(balanceCents, limit) !== "blocked";
      await notify(db, settlement.driverId, v.status === "confirmed" ? "Quitação confirmada" : "Quitação recusada",
        v.status === "confirmed" ? `Recebemos ${brl(settlement.amountCents)}.${unblocked ? " Você já pode ficar online." : " Ainda há saldo a quitar."}` : `Motivo: ${v.reason}`, "/motorista/ganhos");
      publish(userChannel(settlement.driverId), "finance");
      return { ok: true, balanceCents, unblocked };
    }
    case "settings": {
      assertCan(user, "settings", "write");
      requireStepUp(session);
      const v = await body(req, settingsSchema);
      // Antes e depois de cada configuração mudada (limites, pesos, chave Pix da Orbi, formas de pagamento).
      const before: Record<string, unknown> = {}, after: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(v)) {
        if (!value) continue;
        const [old] = await db.select({ value: s.settings.value }).from(s.settings).where(eq(s.settings.key, key));
        before[key] = old?.value ?? null;
        after[key] = value;
        await db.insert(s.settings).values({ key, value }).onConflictDoUpdate({ target: s.settings.key, set: { value } });
      }
      await audit(user.id, "settings.update", "settings", null, { keys: Object.keys(after), before, after });
      return { ok: true };
    }
    default: throw new ApiError(404, "Ação desconhecida.");
  }
}, roles);
