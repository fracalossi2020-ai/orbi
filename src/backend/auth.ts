import { createHmac, randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import fs from "node:fs";
import path from "node:path";
import { and, eq, gt, isNull, ne } from "drizzle-orm";
import { SignJWT, jwtVerify } from "jose";
import { cookies, headers } from "next/headers";
import { dataDir, getDb, schema as s } from "@/database";
import { STAFF } from "@/shared/permissions";
import { decrypt, encrypt, rateLimit } from "./security";
import type { CpfScan } from "@/shared/account";
import { embeddedDbAllowed, isRealProduction } from "@/shared/runtime-config";
import { STATIC } from "@/frontend/lib/site-mode";

const scrypt = promisify(scryptCb) as (p: string, salt: Buffer, len: number) => Promise<Buffer>;
export const COOKIE = "prumo_session";
// Passageiro e motorista ficam conectados por 30 dias; a equipe, por 12 horas (o painel tem dados de todos).
const MAX_AGE_S = 60 * 60 * 24 * 30;
const STAFF_MAX_AGE_S = 60 * 60 * 12;

export async function hashPassword(password: string) {
  const salt = randomBytes(16);
  const key = await scrypt(password, salt, 64);
  return `${salt.toString("hex")}:${key.toString("hex")}`;
}

// Usado quando a conta não existe: a resposta leva o mesmo tempo, e o tempo não revela se o e-mail está cadastrado.
const DUMMY = `${"0".repeat(32)}:${"0".repeat(128)}`;

export async function verifyPassword(password: string, stored: string | null | undefined) {
  const [salt, hash] = (stored ?? DUMMY).split(":");
  if (!salt || !hash) return false;
  const key = await scrypt(password, Buffer.from(salt, "hex"), 64);
  const expected = Buffer.from(hash, "hex");
  return expected.length === key.length && timingSafeEqual(key, expected) && !!stored;
}

function secret() {
  let value = process.env.AUTH_SECRET;
  if (!value) {
    if (isRealProduction(process.env)) throw new Error("Defina AUTH_SECRET em produção.");
    const file = path.join(dataDir(), "secret");
    fs.mkdirSync(dataDir(), { recursive: true });
    if (!fs.existsSync(file)) fs.writeFileSync(file, randomBytes(48).toString("hex"), { mode: 0o600 });
    value = fs.readFileSync(file, "utf8");
  }
  // Chave curta pode ser adivinhada por força bruta: em produção, exige pelo menos 32 caracteres.
  if (value.length < 32 && process.env.NODE_ENV === "production") throw new Error("AUTH_SECRET precisa de pelo menos 32 caracteres.");
  return new TextEncoder().encode(value);
}

/** Mesma chave da sessão, para outros cookies assinados e para cifrar segredos guardados. */
export const authSecret = () => secret();

/** Resumo do CPF com a chave do servidor (HMAC-SHA256): serve para reconhecer o CPF sem guardar o número. */
export const cpfHmac = (cpf: string) => createHmac("sha256", secret()).update(`prumo:cpf:${cpf.replace(/\D/g, "")}`).digest("hex");

/** Segredo do aplicativo autenticador: guardado cifrado, para um vazamento do banco não revelar os códigos. */
export const encryptTotp = (b32: string) => encrypt(b32, secret());
export const decryptTotp = (blob: string) => decrypt(blob, secret());

/** Cookie só por HTTPS quando o site roda com HTTPS (produção). */
const secureCookies = () => {
  if (process.env.NODE_ENV !== "production") return false;
  if (process.env.APP_URL) return process.env.APP_URL.startsWith("https://");
  return !embeddedDbAllowed(process.env);
};

/** Abre uma sessão registrada no banco. mfa: a segunda etapa já foi confirmada (ou não é exigida). */
// remember: false ("Lembrar de mim" desmarcado) grava o cookie sem validade: ele some quando o navegador fecha.
export async function startSession(userId: string, opts: { mfa?: boolean; remember?: boolean } = {}) {
  const db = await getDb();
  const [user] = await db.select({ role: s.users.role }).from(s.users).where(eq(s.users.id, userId));
  const maxAge = user && STAFF.includes(user.role) ? STAFF_MAX_AGE_S : MAX_AGE_S;
  const ua = ((await headers()).get("user-agent") ?? "").slice(0, 300) || null;
  const [row] = await db.insert(s.sessions).values({
    userId, userAgent: ua, expiresAt: new Date(Date.now() + maxAge * 1000), mfaAt: opts.mfa ? new Date() : null,
  }).returning({ id: s.sessions.id });
  const token = await new SignJWT({ sid: row.id }).setProtectedHeader({ alg: "HS256" }).setSubject(userId).setIssuedAt().setExpirationTime(`${maxAge}s`).sign(secret());
  (await cookies()).set(COOKIE, token, { httpOnly: true, sameSite: "lax", secure: secureCookies(), path: "/", ...(opts.remember === false ? {} : { maxAge }) });
  return row.id;
}

/** Encerra a sessão deste aparelho de verdade (não só apaga o cookie). */
export async function endSession() {
  const cur = await readSession();
  if (cur) await (await getDb()).update(s.sessions).set({ revokedAt: new Date() }).where(eq(s.sessions.id, cur.session.id));
  (await cookies()).delete(COOKIE);
}

/** Encerra as sessões da conta em todos os aparelhos (menos, se indicado, a atual). */
export async function revokeSessions(userId: string, exceptId?: string) {
  const db = await getDb();
  await db.update(s.sessions).set({ revokedAt: new Date() })
    .where(and(eq(s.sessions.userId, userId), isNull(s.sessions.revokedAt), exceptId ? ne(s.sessions.id, exceptId) : undefined));
}

export type SessionUser = typeof s.users.$inferSelect;
export type SessionRow = typeof s.sessions.$inferSelect;

/** Sessão do cookie, conferida no banco: encerrada, vencida ou de conta suspensa não vale. */
export async function readSession(): Promise<{ user: SessionUser; session: SessionRow } | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret(), { algorithms: ["HS256"] });
    // Tokens com destinatário (aud) são de outras finalidades (cookies do Google): não valem como sessão.
    if (payload.aud) return null;
    const sid = typeof payload.sid === "string" ? payload.sid : null;
    if (!payload.sub || !sid) return null;
    const db = await getDb();
    const [row] = await db.select({ u: s.users, x: s.sessions }).from(s.sessions).innerJoin(s.users, eq(s.sessions.userId, s.users.id))
      .where(and(eq(s.sessions.id, sid), eq(s.sessions.userId, payload.sub), isNull(s.sessions.revokedAt), gt(s.sessions.expiresAt, new Date())));
    if (!row || row.u.status !== "active") return null;
    // Marca o último uso no máximo a cada 5 minutos (lista de aparelhos conectados).
    if (Date.now() - row.x.lastSeenAt.getTime() > 5 * 60_000) await db.update(s.sessions).set({ lastSeenAt: new Date() }).where(eq(s.sessions.id, sid));
    return { user: row.u, session: row.x };
  } catch {
    return null;
  }
}

/** A segunda etapa ainda falta nesta sessão? */
export const mfaPending = (r: { user: SessionUser; session: SessionRow }) => !!r.user.totpEnabledAt && !r.session.mfaAt;

/**
 * Usuário conectado. Quem ativou a verificação em duas etapas só conta como conectado depois de digitar o código.
 * Conta suspensa perde o acesso na hora, porque a sessão é conferida no banco a cada pedido.
 */
export async function currentUser(): Promise<SessionUser | null> {
  // Versão vitrine (páginas prontas, sem servidor): ninguém entra.
  if (STATIC) return null;
  const r = await readSession();
  return r && !mfaPending(r) ? r.user : null;
}

export const publicUser = (u: SessionUser) => ({
  id: u.id, name: u.name, email: u.email, pendingEmail: u.pendingEmail, emailVerified: Boolean(u.emailVerifiedAt), phone: u.phone, role: u.role,
  viaGoogle: Boolean(u.googleSub), rating: u.ratingCount ? u.ratingSum / u.ratingCount : null, ratingCount: u.ratingCount, mfa: !!u.totpEnabledAt,
});

/**
 * O CPF já pertence a outra conta? Confere o CPF das contas e o dos cadastros de motorista
 * (motoristas antigos têm o CPF só no cadastro). exceptUserId: a própria conta, que não conta como duplicada.
 * O bloqueio de 180 dias de CPF de motorista excluído NÃO entra aqui (cadastro de passageiro é livre): ver cpfDriverBlocked.
 */
export async function cpfTaken(cpf: string, exceptUserId?: string) {
  const db = await getDb();
  const [byUser] = await db.select({ id: s.users.id }).from(s.users).where(and(eq(s.users.cpf, cpf), exceptUserId ? ne(s.users.id, exceptUserId) : undefined)).limit(1);
  if (byUser) return true;
  const [byDriver] = await db.select({ id: s.drivers.userId }).from(s.drivers).where(and(eq(s.drivers.cpf, cpf), exceptUserId ? ne(s.drivers.userId, exceptUserId) : undefined)).limit(1);
  return !!byDriver;
}

/**
 * CPF de conta excluída que tinha histórico real de motorista fica bloqueado por 180 dias (guardado só como HMAC).
 * Vale apenas para virar motorista de novo (become-driver e cadastro de motorista).
 */
export async function cpfDriverBlocked(cpf: string) {
  const db = await getDb();
  const [blocked] = await db.select({ h: s.deletedCpfBlocks.cpfHmac }).from(s.deletedCpfBlocks)
    .where(and(eq(s.deletedCpfBlocks.cpfHmac, cpfHmac(cpf)), gt(s.deletedCpfBlocks.blockedUntil, new Date()))).limit(1);
  return !!blocked;
}

/** Limite de tentativas (mantido com este nome para as rotas existentes). */
export const checkRateLimit = rateLimit;

/**
 * Pedidos que revelam se um CPF tem conta (aviso do cadastro, cadastro, conclusão pelo Google) dividem
 * um limite por endereço bem menor que o do e-mail: um cadastro de verdade usa dois ou três.
 */
export const cpfBudget = (ip: string) => rateLimit(`cpf:${ip}`, 10);

/**
 * Teto de consultas de CPF para o servidor todo em 15 minutos: quem troca de endereço não ganha consultas a mais.
 * Passado o teto o servidor só "endurece" (resposta genérica, sem confirmar que o CPF existe); ele nunca bloqueia o
 * cadastro de ninguém, para não virar negação de serviço.
 */
const CPF_LOOKUP_GLOBAL = Number(process.env.PRUMO_CPF_LOOKUP_LIMIT ?? 300) || 300;

/** Limite por endereço (cpfBudget) somado ao teto geral. Usar em tudo que responde se um CPF já tem conta. */
export function cpfScan(ip: string): CpfScan {
  if (!cpfBudget(ip)) return "limited";
  return rateLimit("cpf-lookup:all", CPF_LOOKUP_GLOBAL) ? "ok" : "hardened";
}
