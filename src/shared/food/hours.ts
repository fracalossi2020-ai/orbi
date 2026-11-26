import type { Turn } from "./types";

const HM = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** "HH:MM" em minutos do dia, ou null se inválido. */
export function toMinutes(hm: string): number | null {
  const m = HM.exec(hm);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

/** Minutos do dia no horário de Brasília (as lojas estão lá, qualquer que seja o fuso do aparelho). */
export function brasiliaMinutes(d: Date): number {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(d);
  const h = Number(parts.find((p) => p.type === "hour")?.value ?? 0);
  const m = Number(parts.find((p) => p.type === "minute")?.value ?? 0);
  return h * 60 + m;
}

/** Aberta em algum turno? Turno que passa da meia-noite (22:00 a 02:00) vale; turno inválido é ignorado. */
export function isOpenAt(turns: Turn[], minutes: number): boolean {
  return turns.some((t) => {
    const a = toMinutes(t.open), b = toMinutes(t.close);
    if (a === null || b === null || a === b) return false;
    return a < b ? minutes >= a && minutes < b : minutes >= a || minutes < b;
  });
}

/** Erro de turno para o painel da loja, ou null. */
export function turnError(t: Turn): string | null {
  const a = toMinutes(t.open), b = toMinutes(t.close);
  if (a === null || b === null) return "Informe horários válidos.";
  if (a === b) return "Abre e fecha no mesmo horário.";
  return null;
}

export const turnLabel = (t: Turn) => `${t.open} às ${t.close}`;
