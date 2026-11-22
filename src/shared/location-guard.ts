import { haversineM, type LatLng } from "./geo";

/** Teto de velocidade plausível para um carro: 45 m/s (cerca de 162 km/h). */
export const MAX_SPEED_MPS = 45;
/** Deslocamentos até este valor valem sempre (ruído do GPS, tempo curto entre dois envios). */
export const JITTER_ALLOWANCE_M = 150;
/** Por quanto tempo um salto recusado marca "cheguei" e "encerrar" para revisão. */
export const JUMP_REVIEW_WINDOW_MS = 10 * 60_000;

export type KnownPosition = { lat: number | null; lng: number | null; at: Date | null };
export type MoveCheck = { ok: true; distanceM: number; speedMps: number } | { ok: false; distanceM: number; speedMps: number; reason: string };

/**
 * Confere se ir da posição anterior para a nova é fisicamente possível no tempo decorrido.
 * Sem posição anterior (primeiro envio, ou volta depois de muito tempo) aceita. O tempo conta a partir da última
 * posição aceita: um salto recusado não "reinicia" o relógio, então um deslocamento real acaba passando.
 */
export function plausibleMove(prev: KnownPosition | null, next: LatLng, now: Date = new Date(), maxSpeedMps = MAX_SPEED_MPS): MoveCheck {
  if (!prev || prev.lat === null || prev.lng === null || !prev.at) return { ok: true, distanceM: 0, speedMps: 0 };
  const distanceM = haversineM({ lat: prev.lat, lng: prev.lng }, next);
  const seconds = Math.max(1, (now.getTime() - prev.at.getTime()) / 1000);
  const speedMps = distanceM / seconds;
  if (distanceM <= JITTER_ALLOWANCE_M || speedMps <= maxSpeedMps) return { ok: true, distanceM, speedMps };
  return { ok: false, distanceM, speedMps, reason: "Sua localização mudou rápido demais para ser real. Confira o GPS do celular e tente de novo em instantes." };
}
