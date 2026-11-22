/**
 * Regras puras para resolver corrida presa: valor cobrado por trecho ou informado pela equipe, e quando a corrida
 * em viagem passa a pedir revisão. Sem acesso a banco.
 */
import { haversineM, type LatLng } from "./geo";
import { MIN_TRIP_FRACTION } from "./ride-guards";

export type FareParts = { grossCents: number; serviceFeeCents: number; discountCents: number; totalCents: number; commissionBps: number };

/** Corrida em viagem há mais de 3x a duração estimada (mínimo 60 min) vai para revisão da equipe. */
export const STUCK_FACTOR = 3;
export const STUCK_MIN_S = 60 * 60;
export const stuckAfterS = (durationS: number) => Math.max(STUCK_MIN_S, durationS * STUCK_FACTOR);
export const isStuck = (startedAt: Date | null, durationS: number, now = new Date()) =>
  !!startedAt && (now.getTime() - startedAt.getTime()) / 1000 > stuckAfterS(durationS);

/** Valor informado pela equipe para encerrar: de 1 centavo a 3x o estimado. */
export const MAX_STAFF_CHARGE_FACTOR = 3;
export function staffChargeProblem(amountCents: number, estimatedCents: number): string | null {
  if (!Number.isInteger(amountCents) || amountCents < 1) return "Informe um valor maior que zero. Para não cobrar, cancele a corrida.";
  if (amountCents > estimatedCents * MAX_STAFF_CHARGE_FACTOR) return "O valor não pode passar de 3 vezes o valor estimado da corrida.";
  return null;
}

/**
 * Refaz os valores da corrida para um total novo, mantendo a comissão da corrida (comissão só sobre o bruto).
 * Taxa e desconto acompanham a proporção; o bruto absorve a diferença para o total bater no centavo.
 */
export function scaleFareToTotal(f: FareParts, newTotalCents: number) {
  const total = Math.max(0, Math.round(newTotalCents));
  const ratio = f.totalCents > 0 ? total / f.totalCents : 1;
  const serviceFeeCents = Math.min(total, Math.round(f.serviceFeeCents * ratio));
  const discountCents = Math.round(f.discountCents * ratio);
  const grossCents = Math.max(0, total - serviceFeeCents + discountCents);
  const commissionCents = Math.round((grossCents * f.commissionBps) / 10000);
  return { totalCents: total, serviceFeeCents, discountCents, grossCents, commissionCents, driverNetCents: grossCents - commissionCents };
}

/**
 * Fração do trajeto cumprida, entre o mínimo de viagem e 1. Mede o progresso rumo ao destino, não só a distância da partida:
 * clamp(min(d(origem, pos), total - d(pos, destino)) / total, 0, 1). Quem está do lado oposto da partida (longe da origem,
 * mas também longe do destino) tem progresso 0 e paga só o mínimo, em vez de 100%.
 */
export function tripFraction(origin: LatLng, dest: LatLng, at: LatLng): number {
  const whole = haversineM(origin, dest);
  if (whole <= 0) return 1;
  const progress = Math.min(haversineM(origin, at), whole - haversineM(at, dest)) / whole;
  return Math.min(1, Math.max(MIN_TRIP_FRACTION, Math.max(0, progress)));
}

/** Motivo de encerrar fora do raio: obrigatório, com um mínimo de texto. */
export function farCompletionReasonProblem(reason: string | undefined | null): string | null {
  const r = (reason ?? "").trim();
  return r.length >= 5 ? null : "Informe o motivo de encerrar longe do destino (por exemplo, \"passageiro desceu antes\").";
}
