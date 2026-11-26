import { eq, lt, sql } from "drizzle-orm";
import { getDb, schema as s } from "@/database";

/**
 * Limite de tentativas guardado no banco: sobrevive a reinício e vale para várias instâncias. Usado nas chaves de
 * autenticação (login, segunda etapa, recuperação de senha, códigos, CPF, cadastro). As demais seguem no limite em
 * memória de security.ts (rateLimit), que é mais barato.
 * Cada chamada é uma única instrução atômica: INSERT ... ON CONFLICT DO UPDATE ... RETURNING.
 */

export type LimitResult = { ok: boolean; n: number; windowEndsAt: Date };

/** Conta uma tentativa na chave. ok = false quando passou de `max` dentro da janela. */
export async function rateLimitDbDetail(key: string, max = 10, windowMs = 15 * 60_000): Promise<LimitResult> {
  const db = await getDb();
  const t = s.rateLimits;
  const win = sql`(${windowMs}::int * interval '1 millisecond')`;
  const expired = sql`${t.windowStart} < now() - ${win}`;
  const nextN = sql`(CASE WHEN ${expired} THEN 1 ELSE ${t.n} + 1 END)`;
  const nextStart = sql`(CASE WHEN ${expired} THEN now() ELSE ${t.windowStart} END)`;
  const [row] = await db.insert(t).values({ key, n: 1 }).onConflictDoUpdate({
    target: t.key,
    set: {
      n: sql`${nextN}`,
      windowStart: sql`${nextStart}`,
      blockedUntil: sql`(CASE WHEN ${nextN} > ${max} THEN ${nextStart} + ${win} ELSE NULL END)`,
    },
  }).returning({ n: t.n, windowStart: t.windowStart });
  return { ok: row.n <= max, n: row.n, windowEndsAt: new Date(row.windowStart.getTime() + windowMs) };
}

/** Conta uma tentativa; true se ainda está dentro do limite. */
export async function rateLimitDb(key: string, max = 10, windowMs = 15 * 60_000): Promise<boolean> {
  return (await rateLimitDbDetail(key, max, windowMs)).ok;
}

/** Só consulta (não conta): true se a chave já passou do limite na janela atual. */
export async function isRateLimitedDb(key: string, max = 10, windowMs = 15 * 60_000): Promise<boolean> {
  const db = await getDb();
  const [row] = await db.select({ n: s.rateLimits.n, windowStart: s.rateLimits.windowStart }).from(s.rateLimits).where(eq(s.rateLimits.key, key));
  return !!row && row.windowStart.getTime() + windowMs > Date.now() && row.n > max;
}

/** Quantas tentativas a chave tem na janela atual (0 se vencida ou inexistente). */
export async function rateCountDb(key: string, windowMs = 15 * 60_000): Promise<number> {
  const db = await getDb();
  const [row] = await db.select({ n: s.rateLimits.n, windowStart: s.rateLimits.windowStart }).from(s.rateLimits).where(eq(s.rateLimits.key, key));
  return row && row.windowStart.getTime() + windowMs > Date.now() ? row.n : 0;
}

/** Zera a chave (por exemplo, depois de um login certo). */
export async function resetLimitDb(key: string) {
  const db = await getDb();
  await db.delete(s.rateLimits).where(eq(s.rateLimits.key, key));
}

/**
 * Apaga as chaves vencidas. A janela mais longa usada no código é de 24 h, então nada com mais de 25 h fica:
 * o sweeper chama isto de tempos em tempos.
 */
export async function cleanupRateLimits(maxAgeMs = 25 * 60 * 60_000) {
  const db = await getDb();
  const rows = await db.delete(s.rateLimits).where(lt(s.rateLimits.windowStart, new Date(Date.now() - maxAgeMs))).returning({ k: s.rateLimits.key });
  return rows.length;
}
