/**
 * Defesas simples contra robôs nos formulários abertos (cadastro, contato, interessados): campo-isca escondido,
 * tempo mínimo entre abrir a página e enviar, e teto global por dia. Funções puras, testadas em tests/bot-guard.test.ts.
 */

/** Enviar em menos que isto depois de abrir a página é coisa de robô. */
export const FORM_MIN_MS = 3_000;
/** Página aberta há mais que isto: o carimbo venceu (a pessoa recarrega e tenta de novo). */
export const FORM_MAX_MS = 2 * 60 * 60_000;

/** Tetos globais por dia (todos os endereços somados): passou, a equipe é avisada e o envio é recusado com 429. */
export const DAILY_CAPS = { register: 500, leads: 300, "moto-interest": 300, "food-interest": 300 } as const;
export type CapKind = keyof typeof DAILY_CAPS;

/** Campo-isca preenchido: só um robô enche um campo que a pessoa não vê. */
export const honeypotFilled = (v: unknown) => typeof v === "string" && v.trim() !== "";

/** Carimbo no formato "<milissegundos>.<assinatura>". */
export function parseStamp(stamp: unknown): { ts: number; sig: string } | null {
  if (typeof stamp !== "string") return null;
  const m = /^(\d{10,16})\.([0-9a-f]{64})$/.exec(stamp);
  return m ? { ts: Number(m[1]), sig: m[2] } : null;
}

export type StampVerdict = "ok" | "fast" | "old" | "future";

/** Idade do carimbo: cedo demais, velho demais, do futuro (relógio adulterado) ou dentro da janela. */
export function stampVerdict(ts: number, now: number, minMs = FORM_MIN_MS, maxMs = FORM_MAX_MS): StampVerdict {
  if (ts > now + 5_000) return "future";
  const age = now - ts;
  if (age < minMs) return "fast";
  if (age > maxMs) return "old";
  return "ok";
}

/** Dia (Brasília) para a chave do teto diário, no formato AAAA-MM-DD. */
export const capDay = (now = Date.now()) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date(now));

export const capKey = (kind: CapKind, now = Date.now()) => `cap:${kind}:${capDay(now)}`;
