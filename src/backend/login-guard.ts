import { eq, sql } from "drizzle-orm";
import { getDb, schema as s } from "@/database";
import { FAIL_DECAY_MS, LOGIN_FLOOD_DELAY_MS, LOGIN_FLOOD_MAX, lockDurationMs, progressiveDelayMs } from "@/shared/lockout";
import { STAFF } from "@/shared/permissions";
import { alertAdmins, mailOwner } from "./access";
import { audit } from "./audit-lite";
import { isRateLimitedDb, rateLimitDbDetail } from "./rate-limit-db";

/**
 * Peças do bloqueio de conta e do atraso do login (as regras em si estão em shared/lockout.ts).
 */

/**
 * Fator do atraso da senha errada. 1 em produção; PRUMO_LOGIN_DELAY_SCALE (ex.: 0) existe só para os testes automatizados
 * não esperarem 16 s por falha, e a subida em produção de verdade o recusa (runtimeConfigProblems).
 */
export function delayScale() {
  const raw = process.env.PRUMO_LOGIN_DELAY_SCALE?.trim();
  const n = raw ? Number(raw) : 1;
  return Number.isFinite(n) && n >= 0 ? n : 1;
}

export const sleep = (ms: number) => (ms > 0 ? new Promise<void>((r) => setTimeout(r, ms)) : Promise.resolve());

/** Atraso da resposta de uma senha errada de número n (progressivo a partir da 3ª). */
export const failureDelay = (n: number) => sleep(progressiveDelayMs(n, delayScale()));

/** Soma uma falha na conta (atômico) e devolve a contagem nova e o bloqueio decidido por ela, se houver. */
export async function recordFailure(userId: string): Promise<{ n: number; lockMs: number | null; lockedUntil: Date | null }> {
  const db = await getDb();
  const u = s.users;
  const [row] = await db.update(u).set({
    failedLogins: sql`(CASE WHEN ${u.lastFailedAt} IS NULL OR ${u.lastFailedAt} < now() - (${FAIL_DECAY_MS}::int * interval '1 millisecond') THEN 1 ELSE ${u.failedLogins} + 1 END)`,
    lastFailedAt: sql`now()`,
  }).where(eq(u.id, userId)).returning({ n: u.failedLogins });
  const lockMs = lockDurationMs(row.n);
  const lockedUntil = lockMs ? new Date(Date.now() + lockMs) : null;
  if (lockedUntil) await db.update(u).set({ lockedUntil }).where(eq(u.id, userId));
  return { n: row.n, lockMs, lockedUntil };
}

/** Zera o contador e o bloqueio (login certo, "Esqueci a senha" concluído). */
export async function clearFailures(userId: string) {
  const db = await getDb();
  await db.update(s.users).set({ failedLogins: 0, lockedUntil: null, lastFailedAt: null }).where(eq(s.users.id, userId));
}

/** Conta acabou de ser bloqueada: auditoria, e-mail ao dono (no máximo 1 por dia) e, se for da equipe, aviso aos administradores. */
export async function onLocked(user: { id: string; name: string; email: string | null; role: string }, n: number, lockMs: number) {
  const minutes = Math.round(lockMs / 60_000);
  const label = minutes >= 60 ? `${Math.round(minutes / 60)} h` : `${minutes} min`;
  await audit(user.id, "login.locked", "user", user.id, { failures: n, minutes });
  await mailOwner(user, "Sua conta Orbi foi bloqueada por segurança", `Houve ${n} tentativas de entrar na sua conta com a senha errada, e por isso o acesso foi bloqueado por ${label}.\n\nSe foi você, espere o prazo ou use "Esqueci a senha" para criar uma senha nova agora. Se não foi, use "Esqueci a senha": quem tentou não sabe a sua senha, mas vale trocá-la.`, { key: "lock", windowMs: 24 * 60 * 60_000 });
  if (STAFF.includes(user.role as never)) {
    await alertAdmins(`Conta da equipe bloqueada: ${user.name}`, `A conta da equipe de ${user.name} foi bloqueada por ${label} depois de ${n} tentativas de senha errada.\nPode ser ataque ao painel. Confira o Histórico e, se preciso, suspenda a conta.`, { key: `locked:${user.id}`, windowMs: 60 * 60_000 });
  }
}

/** Há uma onda de falhas de login no servidor todo? Então todo login espera 2 s. */
export async function floodDelay() {
  if (await isRateLimitedDb("login:fail:all", LOGIN_FLOOD_MAX)) await sleep(Math.round(LOGIN_FLOOD_DELAY_MS * delayScale()));
}

/** Conta uma falha de login no servidor todo; ao passar de 300 em 15 min, avisa a equipe (uma vez por hora). */
export async function countLoginFailure() {
  const r = await rateLimitDbDetail("login:fail:all", LOGIN_FLOOD_MAX);
  if (!r.ok) await alertAdmins("Muitas senhas erradas no login da Orbi", `Foram mais de ${LOGIN_FLOOD_MAX} tentativas de login com senha errada em 15 minutos. Ligamos um atraso de 2 segundos em todos os logins enquanto durar.\nPode ser ataque de adivinhação de senhas. Confira o Histórico.`, { key: "login-flood", windowMs: 60 * 60_000 });
}
