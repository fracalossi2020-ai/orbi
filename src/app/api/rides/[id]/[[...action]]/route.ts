import fs from "node:fs/promises";
import path from "node:path";
import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { dataDir, getDb, schema as s } from "@/database";
import { ApiError, audit, body, requireUuid, route } from "@/backend/api";
import { publish, userChannel } from "@/backend/bus";
import { raiseEmergency } from "@/backend/emergency";
import { parseSosPoint, sosProblem } from "@/shared/emergency";
import { cancelRide, completeTrip, markArrived, rateRide, refreshPayment, rideView, startTrip } from "@/backend/rides";
import { checkRateLimit } from "@/backend/auth";
import { fileHeaders } from "@/backend/security";
import { ACTIVE_STATUSES, showsDriverLocation } from "@/shared/transitions";

type P = { id: string; action?: string[] };

async function loadOwned(id: string, userId: string) {
  const db = await getDb();
  const [ride] = await db.select().from(s.rides).where(eq(s.rides.id, requireUuid(id, "Corrida não encontrada.")));
  if (!ride) throw new ApiError(404, "Corrida não encontrada.");
  const as = ride.passengerId === userId ? "passenger" : ride.driverId === userId ? "driver" : null;
  if (!as) throw new ApiError(403, "Esta corrida não é sua.");
  return { ride, as: as as "passenger" | "driver" };
}

export const GET = route<P>(async ({ user, params }) => {
  const { ride, as } = await loadOwned(params.id, user.id);
  const action = params.action?.[0];
  if (!action) {
    if (ride.status === "completed" && ride.paymentStatus === "pending") await refreshPayment(ride.id).catch(() => null);
    return rideView(ride, as);
  }
  // A foto do motorista só vale para o passageiro enquanto a corrida está ativa (mesma regra da posição).
  if (action === "driver-photo" && ride.driverId) {
    if (as !== "passenger" || !showsDriverLocation(ride.status)) throw new ApiError(404, "Sem foto.");
    const db = await getDb();
    const [doc] = await db.select().from(s.documents).where(and(eq(s.documents.driverId, ride.driverId), eq(s.documents.kind, "selfie"), eq(s.documents.status, "approved")));
    if (!doc) throw new ApiError(404, "Sem foto.");
    const file = await fs.readFile(path.join(dataDir(), "uploads", doc.storedName));
    return new NextResponse(file, { headers: fileHeaders(doc.mime, { "Cache-Control": "private, max-age=600" }) });
  }
  throw new ApiError(404, "Recurso não encontrado.");
});

const cancelSchema = z.object({ reason: z.string().trim().max(300).default("") });
const completeSchema = z.object({ reason: z.string().trim().max(200).optional() });
const rateSchema = z.object({ stars: z.number().int().min(1).max(5), note: z.string().trim().max(500).optional() });
// Corpo livre: lat e lng são conferidos em parseSosPoint (finitos e dentro do globo); o resto é ignorado.
const sosSchema = z.object({ lat: z.unknown().optional(), lng: z.unknown().optional() });
const messageSchema = z.object({ body: z.string().trim().min(1, "Escreva a mensagem.").max(500) });

export const POST = route<P>(async ({ req, user, params }) => {
  const { ride, as } = await loadOwned(params.id, user.id);
  const action = params.action?.[0];
  const db = await getDb();
  switch (action) {
    case "cancel": {
      const v = await body(req, cancelSchema);
      await audit(user.id, "ride.cancel", "ride", ride.id, { reason: v.reason });
      return cancelRide(ride.id, user.id, v.reason);
    }
    case "arrive": return markArrived(ride.id, user.id);
    case "start": return startTrip(ride.id, user.id);
    case "complete": {
      // Corpo opcional: o motivo só é usado quando o motorista encerra longe do destino.
      const v = (req.headers.get("content-type") ?? "").includes("application/json") ? await body(req, completeSchema) : { reason: undefined };
      const done = await completeTrip(ride.id, user.id, { reason: v.reason });
      await audit(user.id, "ride.complete", "ride", ride.id, v.reason ? { reason: v.reason } : undefined);
      return done;
    }
    case "rate": {
      const v = await body(req, rateSchema);
      await rateRide(ride.id, user.id, v.stars, v.note);
      return { ok: true };
    }
    case "message": {
      // O chat existe enquanto a corrida está em andamento, entre o passageiro e o motorista dela.
      if (!ACTIVE_STATUSES.includes(ride.status) || !ride.driverId) throw new ApiError(409, "O chat fica disponível só durante a corrida.");
      if (!checkRateLimit(`chat:${user.id}`, 30, 5 * 60_000)) throw new ApiError(429, "Muitas mensagens em pouco tempo. Aguarde um pouco.");
      const v = await body(req, messageSchema);
      await db.insert(s.rideMessages).values({ rideId: ride.id, senderId: user.id, body: v.body });
      const other = as === "passenger" ? ride.driverId : ride.passengerId;
      publish(userChannel(user.id), "ride");
      if (other) publish(userChannel(other), "ride");
      return { ok: true };
    }
    case "emergency": {
      // Só em corrida em andamento ou até 30 min depois de concluída (regra em shared/emergency).
      const problem = sosProblem(ride.status, ride.endedAt);
      if (problem) throw new ApiError(409, problem);
      // Limite por corrida (acionamentos repetidos); o limite de alertas novos por pessoa fica em raiseEmergency.
      if (!checkRateLimit(`sos:${user.id}:${ride.id}`, 5, 10 * 60_000)) return { ok: true, repeated: true, message: "Você já acionou o alerta agora há pouco e a equipe foi avisada. Se estiver em perigo, ligue 190." };
      // A posição do aparelho é opcional: se vier inválida, o alerta segue sem ela.
      const v = await body(req, sosSchema);
      const done = await raiseEmergency({ ride, userId: user.id, as, actorPoint: parseSosPoint(v) });
      return { ok: true, ticketId: done.ticketId, ...(done.repeated ? { repeated: true } : {}), ...(done.throttled ? { throttled: true, message: done.message } : {}) };
    }
    default: throw new ApiError(404, "Ação desconhecida.");
  }
});
