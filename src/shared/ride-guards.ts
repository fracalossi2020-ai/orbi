import { haversineM, type LatLng } from "./geo";

/**
 * Regras antifraude do andamento da corrida: "cheguei" só perto da partida e "encerrar" só perto do destino,
 * depois de um tempo mínimo de viagem. Usam a última posição enviada pelo celular do motorista.
 */

/** Distância máxima da partida para marcar "cheguei", em metros. */
export const ARRIVE_MAX_M = 300;
/** Distância máxima do destino para encerrar a viagem, em metros. */
export const COMPLETE_MAX_M = 500;
/** Posição mais velha que isto não vale (o app envia a posição a cada poucos segundos). */
export const LOCATION_MAX_AGE_MS = 2 * 60_000;
/** Tempo mínimo de viagem: esta fração da duração estimada, nunca menos que o piso. */
export const MIN_TRIP_FRACTION = 0.3;
export const MIN_TRIP_FLOOR_S = 60;

export type DriverPosition = { lat: number | null; lng: number | null; at: Date | null };
export type GuardOptions = { minFraction?: number; minFloorS?: number };

/** Posição utilizável ou o motivo de recusar. */
function usable(pos: DriverPosition | null, now: Date): { point: LatLng } | { error: string } {
  if (!pos || pos.lat === null || pos.lng === null || !pos.at) return { error: "Não sabemos onde você está. Ligue o GPS do celular, abra o app e tente de novo." };
  if (now.getTime() - pos.at.getTime() > LOCATION_MAX_AGE_MS) return { error: "Sua localização está desatualizada. Confira se o GPS está ligado, aguarde alguns segundos e tente de novo." };
  return { point: { lat: pos.lat, lng: pos.lng } };
}

const meters = (m: number) => (m >= 1000 ? `${(m / 1000).toFixed(1).replace(".", ",")} km` : `${Math.round(m / 10) * 10} m`);

/** null quando pode marcar "cheguei". */
export function arriveProblem(pos: DriverPosition | null, origin: LatLng, now = new Date()): string | null {
  const p = usable(pos, now);
  if ("error" in p) return p.error;
  const d = haversineM(p.point, origin);
  return d <= ARRIVE_MAX_M ? null : `Você está a ${meters(d)} do ponto de partida. Chegue mais perto (até ${ARRIVE_MAX_M} m) para avisar o passageiro.`;
}

/** Segundos mínimos entre o início da viagem e o encerramento. */
export function minTripSeconds(durationS: number, o: GuardOptions = {}): number {
  return Math.max(o.minFloorS ?? MIN_TRIP_FLOOR_S, Math.round(durationS * (o.minFraction ?? MIN_TRIP_FRACTION)));
}

/**
 * Conferência do encerramento. kind "far": só o raio de 500 m falhou (o motorista pode encerrar informando um motivo);
 * "other": tempo mínimo ou GPS indisponível, que não se contornam com motivo.
 */
export function completeCheck(pos: DriverPosition | null, dest: LatLng, startedAt: Date | null, durationS: number, now = new Date(), o: GuardOptions = {}): { kind: "far" | "other"; message: string } | null {
  const need = minTripSeconds(durationS, o);
  if (startedAt) {
    const elapsed = (now.getTime() - startedAt.getTime()) / 1000;
    if (elapsed < need) return { kind: "other", message: `A viagem acabou de começar. Ela só pode ser encerrada depois de cerca de ${Math.ceil((need - elapsed) / 60)} min.` };
  }
  const p = usable(pos, now);
  if ("error" in p) return { kind: "other", message: p.error };
  const d = haversineM(p.point, dest);
  return d <= COMPLETE_MAX_M ? null : { kind: "far", message: `Você está a ${meters(d)} do destino. Chegue mais perto (até ${COMPLETE_MAX_M} m) para encerrar a viagem.` };
}

/** null quando pode encerrar a viagem. */
export function completeProblem(pos: DriverPosition | null, dest: LatLng, startedAt: Date | null, durationS: number, now = new Date(), o: GuardOptions = {}): string | null {
  return completeCheck(pos, dest, startedAt, durationS, now, o)?.message ?? null;
}

/** Comissão efetiva: o plano só reduz a da tarifa. O Básico mantém a da tarifa (termo do plano). */
export function effectiveCommissionBps(tariffBps: number, plan: { tier: string | null; commissionBps: number } | null): number {
  if (!plan || plan.tier === "basico") return tariffBps;
  return Math.min(tariffBps, plan.commissionBps);
}

/**
 * Comissão e líquido do motorista para uma corrida: a mesma conta para a oferta, o aceite e a liquidação.
 * A comissão incide só sobre o bruto; cupom e taxa de serviço não entram.
 */
export function driverFare(grossCents: number, tariffBps: number, plan: { tier: string | null; commissionBps: number } | null) {
  const commissionBps = effectiveCommissionBps(tariffBps, plan);
  const commissionCents = Math.round((grossCents * commissionBps) / 10000);
  return { commissionBps, commissionCents, driverNetCents: grossCents - commissionCents };
}
