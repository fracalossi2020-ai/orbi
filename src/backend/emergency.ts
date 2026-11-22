import { createHmac } from "node:crypto";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { getDb, schema as s } from "@/database";
import { publish, STAFF_CHANNEL } from "./bus";
import { sendMail } from "./mail";
import { notify } from "./rides";
import { audit } from "./api";
import { checkRateLimit } from "./auth";
import { SOS_THROTTLED_MESSAGE, SOS_USER_LIMIT, SOS_USER_WINDOW_MS, staffEmail, type SosActor, type SosPoint } from "@/shared/emergency";
import { showsDriverLocation } from "@/shared/transitions";
import { appUrl } from "@/shared/runtime-config";

type Ride = typeof s.rides.$inferSelect;

/**
 * Canal extra (opcional) para o alerta, por exemplo um serviço de mensagens que o dono contratar depois.
 * Com EMERGENCY_WEBHOOK_URL (https), recebe um POST com o resumo em JSON assinado: o header X-Orbi-Signature leva
 * "sha256=" + HMAC-SHA256 do corpo, com a chave EMERGENCY_WEBHOOK_SECRET (obrigatória: sem ela o canal é ignorado, nunca cai no AUTH_SECRET).
 * Não segue redirecionamento. Sem a variável, não faz nada.
 * Não existe envio de WhatsApp no projeto: este é só o ponto de encaixe.
 */
async function extraChannel(payload: Record<string, unknown>) {
  const url = process.env.EMERGENCY_WEBHOOK_URL;
  if (!url) return;
  try {
    if (new URL(url).protocol !== "https:") { console.error("[emergência] EMERGENCY_WEBHOOK_URL precisa ser https: canal extra ignorado."); return; }
    const text = JSON.stringify(payload);
    const key = process.env.EMERGENCY_WEBHOOK_SECRET?.trim();
    if (!key) { console.error("[emergência] EMERGENCY_WEBHOOK_SECRET ausente: canal extra ignorado."); return; }
    const signature = `sha256=${createHmac("sha256", key).update(text).digest("hex")}`;
    await fetch(url, {
      method: "POST", headers: { "Content-Type": "application/json", "X-Orbi-Signature": signature }, body: text,
      redirect: "manual", signal: AbortSignal.timeout(5000),
    });
  } catch { /* canal extra é opcional: a falha dele não derruba o alerta */ }
}

/**
 * Registra o alerta, grava na auditoria e avisa a equipe (admin e atendente) no painel e por e-mail.
 * Só registra e avisa: não suspende, cancela nem pune ninguém.
 * No máximo um alerta aberto por corrida: um novo acionamento só atualiza a posição e a hora do alerta existente
 * (sem novo chamado, notificação ou e-mail). Um alerta novo conta no limite de 3 por hora de cada pessoa; acima dele o alerta
 * ainda é registrado e aparece no painel, mas sem e-mail nem webhook (`throttled` + `message` na resposta).
 * `repeated` na resposta: o acionamento não gerou aviso novo.
 */
export async function raiseEmergency(o: { ride: Ride; userId: string; as: SosActor; actorPoint: SosPoint | null }) {
  const db = await getDb();
  const { ride, as } = o;
  // A posição do motorista só vale durante a corrida (mesma regra do passageiro): depois dela seria rastreá-lo.
  const live = showsDriverLocation(ride.status);
  const [driver] = live && ride.driverId ? await db.select({ lat: s.drivers.lat, lng: s.drivers.lng }).from(s.drivers).where(eq(s.drivers.userId, ride.driverId)) : [];
  const driverPoint = driver?.lat != null && driver?.lng != null ? { lat: driver.lat, lng: driver.lng } : null;
  // Quem acionou manda a posição do próprio aparelho; a do motorista já fica no cadastro dele (GPS do app).
  const passengerPoint = as === "passenger" ? o.actorPoint : null;
  const effectiveDriver = live && as === "driver" && o.actorPoint ? o.actorPoint : driverPoint;
  const positions = {
    driverLat: effectiveDriver?.lat ?? null, driverLng: effectiveDriver?.lng ?? null,
    passengerLat: passengerPoint?.lat ?? null, passengerLng: passengerPoint?.lng ?? null,
    actorLat: o.actorPoint?.lat ?? null, actorLng: o.actorPoint?.lng ?? null,
  };

  const refresh = async () => {
    const [open] = await db.select().from(s.emergencies).where(and(eq(s.emergencies.rideId, ride.id), isNull(s.emergencies.reviewedAt)));
    if (!open) return null;
    // Só sobrescreve a posição que veio agora: um acionamento sem GPS não apaga a anterior.
    await db.update(s.emergencies).set({
      triggerCount: sql`${s.emergencies.triggerCount} + 1`, lastTriggeredAt: new Date(),
      ...(positions.driverLat !== null ? { driverLat: positions.driverLat, driverLng: positions.driverLng } : {}),
      ...(positions.passengerLat !== null ? { passengerLat: positions.passengerLat, passengerLng: positions.passengerLng } : {}),
      ...(positions.actorLat !== null ? { actorLat: positions.actorLat, actorLng: positions.actorLng } : {}),
    }).where(eq(s.emergencies.id, open.id));
    await audit(o.userId, "ride.emergency_repeat", "ride", ride.id, { emergency: open.id, as, hasPosition: Boolean(o.actorPoint) });
    publish(STAFF_CHANNEL, "emergency");
    return { ticketId: open.ticketId, emergencyId: open.id, repeated: true as const, throttled: false as const };
  };

  const existing = await refresh();
  if (existing) return existing;
  // Acima do limite por hora o alerta NÃO é descartado: fica registrado (chamado, auditoria, aviso no painel), só sem novo e-mail/webhook.
  const throttled = !checkRateLimit(`sos-user:${o.userId}`, SOS_USER_LIMIT, SOS_USER_WINDOW_MS);

  const [ticket] = await db.insert(s.tickets).values({
    userId: o.userId, rideId: ride.id, kind: "emergencia", priority: "critical", subject: "Alerta de emergência em corrida",
    body: `Acionado por ${as === "passenger" ? "passageiro" : "motorista"} durante a corrida.`,
  }).returning();
  let em: typeof s.emergencies.$inferSelect;
  try {
    [em] = await db.insert(s.emergencies).values({ rideId: ride.id, triggeredBy: o.userId, actor: as, ticketId: ticket.id, ...positions }).returning();
  } catch (e) {
    // Dois acionamentos juntos: o índice único deixou passar só um alerta aberto; o outro vira atualização dele.
    await db.delete(s.tickets).where(eq(s.tickets.id, ticket.id));
    const again = await refresh();
    if (again) return again;
    throw e;
  }
  await audit(o.userId, "ride.emergency", "ride", ride.id, { ticket: ticket.id, emergency: em.id, as, hasPosition: Boolean(o.actorPoint), ...(throttled ? { throttled: true } : {}) });

  // Só a equipe ativa recebe: conta suspensa ou excluída não é avisada.
  const staff = await db.select({ id: s.users.id, email: s.users.email }).from(s.users).where(and(inArray(s.users.role, ["admin", "atendente"]), eq(s.users.status, "active")));
  for (const a of staff) await notify(db, a.id, "Emergência em corrida", `Alerta na corrida ${ride.id.slice(0, 8)}. Abra o painel de emergências.`, "/admin/emergencias");
  publish(STAFF_CHANNEL, "ticket");
  publish(STAFF_CHANNEL, "emergency");
  if (throttled) return { ticketId: ticket.id, emergencyId: em.id, repeated: false as const, throttled: true as const, message: SOS_THROTTLED_MESSAGE };

  // Links sempre a partir de APP_URL: nunca do Host do pedido, que o cliente controla.
  const panelUrl = `${appUrl(process.env)}/admin/emergencias`;
  const mail = staffEmail({
    rideId: ride.id, as, at: em.createdAt, panelUrl,
    points: [
      { label: "Motorista", point: effectiveDriver },
      { label: "Passageiro", point: passengerPoint ?? { lat: ride.originLat, lng: ride.originLng } },
    ],
  });
  // E-mail é melhor esforço: se falhar, o aviso no painel já está gravado.
  await Promise.allSettled([
    ...staff.filter((a) => a.email).map((a) => sendMail(a.email!, mail.subject, mail.text)),
    extraChannel({ type: "emergency", emergencyId: em.id, rideId: ride.id, actor: as, panelUrl, at: em.createdAt }),
  ]);
  return { ticketId: ticket.id, emergencyId: em.id, repeated: false as const, throttled: false as const };
}
