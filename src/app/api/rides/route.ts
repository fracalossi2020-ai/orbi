import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema as s } from "@/database";
import { ApiError, audit, body, route } from "@/backend/api";
import { checkRateLimit } from "@/backend/auth";
import { activeRideFor, MAX_STOPS, quote, requestRide, rideSummaries, rideView } from "@/backend/rides";
import { nextRideCursor, pageParams, ridesBefore, ridesOrder } from "@/backend/pagination";
import { PAYMENT_METHODS } from "@/shared/payment-methods";
import { PASSENGER_APP } from "@/shared/permissions";

const point = z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) });
const placed = point.extend({ label: z.string().trim().min(1).max(200) });
const requestSchema = z.object({
  origin: placed, dest: placed, categoryId: z.string().uuid(), paymentMethod: z.enum(PAYMENT_METHODS),
  couponCode: z.string().trim().max(40).nullish(),
  // Pedido para outra pessoa: o motorista precisa saber quem procurar e como ligar.
  rider: z.object({
    name: z.string().trim().min(2, "Digite o nome de quem vai viajar.").max(80),
    phone: z.string().transform((v) => v.replace(/\D/g, "")).pipe(z.string().regex(/^[1-9]{2}9?\d{8}$/, "Digite o celular de quem vai viajar, com DDD.")),
  }).nullish(),
  stops: z.array(placed).max(MAX_STOPS).default([]),
  // Horário escolhido para a corrida agendada (ISO 8601); ausente quando é para agora.
  scheduledFor: z.string().datetime({ offset: true }).transform((v) => new Date(v)).nullish(),
});
const quoteSchema = z.object({ origin: point, dest: point, couponCode: z.string().trim().max(40).nullish(), stops: z.array(point).max(MAX_STOPS).default([]) });

// A corrida ativa vem na vista completa (mapa, chat, Pix); o histórico vem enxuto, paginado (limit e before) e em lote.
export const GET = route(async ({ req, user }) => {
  const db = await getDb();
  const { limit, before } = pageParams(req, 50, 100);
  const active = await activeRideFor(user.id, "passenger");
  const rows = await db.select().from(s.rides).where(and(eq(s.rides.passengerId, user.id), ridesBefore(before)))
    .orderBy(...ridesOrder()).limit(limit + 1);
  const page = rows.slice(0, limit);
  return {
    active: active ? await rideView(active, "passenger") : null,
    history: await rideSummaries(page.filter((r) => r.id !== active?.id), "passenger"),
    nextBefore: nextRideCursor(page, rows.length > limit),
  };
}, { roles: PASSENGER_APP });

export const POST = route(async ({ req, user }) => {
  const url = new URL(req.url);
  if (url.searchParams.get("quote") !== null) {
    // Cada cotação consulta o serviço de rotas: limite generoso por conta.
    if (!checkRateLimit(`quote:${user.id}`, 120, 10 * 60_000)) throw new ApiError(429, "Muitas consultas de preço. Aguarde alguns minutos.");
    const v = await body(req, quoteSchema);
    // Cupons não podem ser descobertos por tentativa e erro.
    if (v.couponCode && !checkRateLimit(`coupon:${user.id}`, 15, 60 * 60_000)) throw new ApiError(429, "Muitas tentativas de cupom. Aguarde uma hora.");
    return quote(v.origin, v.dest, v.couponCode, v.stops, user.id);
  }
  if (!checkRateLimit(`ride:${user.id}`, 20, 60 * 60_000)) throw new ApiError(429, "Muitos pedidos em pouco tempo. Aguarde um pouco.");
  const v = await body(req, requestSchema);
  const ride = await requestRide(user.id, v);
  await audit(user.id, "ride.request", "ride", ride.id);
  return rideView(ride, "passenger");
}, { roles: PASSENGER_APP });
