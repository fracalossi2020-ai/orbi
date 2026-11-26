import { createHmac, timingSafeEqual } from "node:crypto";
import { honeypotFilled, parseStamp, stampVerdict, capKey, DAILY_CAPS, FORM_MIN_MS, type CapKind } from "@/shared/bot-guard";
import { ApiError } from "./api-error";
import { alertAdmins } from "./access";
import { authSecret } from "./auth";
import { rateLimitDb } from "./rate-limit-db";

const sign = (ts: number) => createHmac("sha256", authSecret()).update(`prumo:form:${ts}`).digest("hex");

/** Carimbo de "página aberta agora", assinado com a chave do servidor (não dá para forjar uma hora antiga). */
export const newFormStamp = (now = Date.now()) => `${now}.${sign(now)}`;

/**
 * Só para os testes automatizados: aceita envio sem carimbo e sem tempo mínimo (as ações de API dos testes não abrem página).
 * A subida em produção de verdade recusa esta variável (runtimeConfigProblems).
 */
const relaxed = () => process.env.PRUMO_FORM_GUARD_RELAX === "true";

/**
 * Parece robô? Campo-isca preenchido, ou carimbo ausente, forjado, rápido demais (< 3 s) ou velho demais (> 2 h).
 * O chamador responde { ok: true } sem gravar nada: o robô não aprende o que o denunciou.
 */
export function looksLikeBot(input: { website?: unknown; stamp?: unknown }, now = Date.now()): boolean {
  if (honeypotFilled(input.website)) return true;
  const p = parseStamp(input.stamp);
  if (!p) return !relaxed();
  const expected = Buffer.from(sign(p.ts), "hex");
  const given = Buffer.from(p.sig, "hex");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return true;
  return stampVerdict(p.ts, now, relaxed() ? 0 : FORM_MIN_MS) !== "ok";
}

const LABEL: Record<CapKind, string> = { register: "cadastros", leads: "mensagens e interessados", "moto-interest": "interessados em Orbi Moto", "food-interest": "lojas interessadas no Orbi Food" };

/** Conta mais um envio no teto do dia. Passou do teto: avisa a equipe (uma vez por dia) e recusa com 429. */
export async function dailyCap(kind: CapKind) {
  const cap = DAILY_CAPS[kind];
  const key = capKey(kind);
  if (await rateLimitDb(key, cap, 25 * 60 * 60_000)) return;
  await alertAdmins(`Teto diário de ${LABEL[kind]} atingido`, `Passaram de ${cap} ${LABEL[kind]} hoje. Os novos envios estão sendo recusados até amanhã. Pode ser ataque de robôs: confira o Histórico e a lista de interessados.`, { key: `${key}`, windowMs: 24 * 60 * 60_000 });
  throw new ApiError(429, "Estamos recebendo muitos pedidos agora. Tente de novo mais tarde.");
}
