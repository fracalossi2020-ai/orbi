import { and, eq, gt } from "drizzle-orm";
import { getDb, schema as s } from "@/database";
import { appUrl } from "@/shared/runtime-config";
import { STAFF } from "@/shared/permissions";
import { deviceLabel, isNewAccess, KNOWN_DEVICE_MS, type KnownAccess } from "@/shared/sessions";
import { publish, STAFF_CHANNEL } from "./bus";
import { requestOrigin } from "./audit-lite";
import { sendMail } from "./mail";
import { rateLimitDb } from "./rate-limit-db";
import type { SessionUser } from "./auth";

/**
 * Avisos de segurança por e-mail: dono da conta e administradores. Falha de envio nunca derruba a ação que gerou o aviso.
 */

const quiet = (p: Promise<unknown>) => p.catch((e) => console.error("[aviso de segurança]", (e as Error).message));
const firstName = (name: string) => name.split(" ")[0];

/** E-mail ao dono da conta. Com `oncePer`, no máximo um por período para a mesma chave (por exemplo, 1 por dia). */
export async function mailOwner(user: { id: string; name: string; email: string | null }, subject: string, text: string, oncePer?: { key: string; windowMs: number }) {
  if (!user.email) return false;
  if (oncePer && !(await rateLimitDb(`mail:${oncePer.key}:${user.id}`, 1, oncePer.windowMs))) return false;
  await quiet(sendMail(user.email, subject, `Olá, ${firstName(user.name)}.\n\n${text}`));
  return true;
}

/** Avisa todos os administradores ativos (e-mail) e publica no canal da equipe (painel ao vivo). */
export async function alertAdmins(subject: string, text: string, oncePer?: { key: string; windowMs: number }) {
  if (oncePer && !(await rateLimitDb(`alert:${oncePer.key}`, 1, oncePer.windowMs))) return false;
  const db = await getDb();
  const admins = await db.select({ name: s.users.name, email: s.users.email }).from(s.users).where(and(eq(s.users.role, "admin"), eq(s.users.status, "active")));
  await Promise.all(admins.filter((a) => a.email).map((a) => quiet(sendMail(a.email!, subject, `Olá, ${firstName(a.name)}.\n\n${text}`))));
  publish(STAFF_CHANNEL, "security");
  return true;
}

/** Aparelhos e redes que já abriram sessão nesta conta nos últimos 90 dias. Chame ANTES de abrir a sessão nova. */
export async function previousAccesses(userId: string): Promise<KnownAccess[]> {
  const db = await getDb();
  const rows = await db.select({ ip: s.sessions.ip, ua: s.sessions.userAgent }).from(s.sessions)
    .where(and(eq(s.sessions.userId, userId), gt(s.sessions.createdAt, new Date(Date.now() - KNOWN_DEVICE_MS)))).limit(500);
  return rows;
}

const when = () => new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" }).format(new Date());

/**
 * Aviso de acesso depois de uma senha certa. Passageiro e motorista: só quando o aparelho e a rede são novos.
 * Equipe: sempre, por e-mail ao próprio dono e no canal da equipe (painel ao vivo).
 */
export async function notifyLogin(user: SessionUser, previous: KnownAccess[]) {
  const o = await requestOrigin();
  const staff = STAFF.includes(user.role);
  const place = o.ip ? `rede ${o.ip}` : "rede desconhecida";
  if (staff) {
    publish(STAFF_CHANNEL, "security");
    await mailOwner(user, "Acesso ao painel da Orbi", `Houve um acesso ao painel da equipe com a sua conta em ${when()}.\nAparelho: ${deviceLabel(o.ua)}\nOrigem: ${place}\n\nSe não foi você, troque a senha agora e fale com um administrador.`);
    return;
  }
  if (!isNewAccess(previous, { ip: o.ip, ua: o.ua })) return;
  await mailOwner(user, "Novo acesso à sua conta", `Sua conta na Orbi foi acessada de um aparelho novo em ${when()}.\nAparelho: ${deviceLabel(o.ua)}\nOrigem: ${place}\n\nSe foi você, não precisa fazer nada. Se não foi, troque a senha em "Esqueci a senha" e encerre as sessões em Minha segurança.`);
}

/** Endereço público do site, sem barra no fim (links de e-mail). */
export const siteBase = () => appUrl(process.env);
