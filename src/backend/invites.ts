import { createHmac, randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { getDb, schema as s } from "@/database";
import { inviteExpiry } from "@/shared/invite";
import { INVITE_TTL_MS } from "@/shared/sessions";
import { appUrl } from "@/shared/runtime-config";
import { authSecret } from "./auth";
import { separatedHosts } from "./host";
import { sendMail } from "./mail";

/** Resumo do token do convite (HMAC com a chave do servidor): o token em si nunca fica no banco. */
export const hashInviteToken = (token: string) => createHmac("sha256", authSecret()).update(`prumo:invite:${token}`).digest("hex");

/** Endereço da tela do convite: no host do painel (modo separado) ou no site (um host só). Sempre da configuração, nunca do pedido. */
export const inviteUrl = (token: string) => `${separatedHosts()?.urls.admin ?? appUrl(process.env)}/convite/${token}`;

const ROLE_LABEL: Record<string, string> = { admin: "administrador", gestor: "gestor", atendente: "atendente" };

/**
 * Cria o convite (válido por 24 h, uso único) e envia o link por e-mail. Se o e-mail não sair, o convite é desfeito
 * e o erro sobe: ninguém fica com uma conta que não consegue ativar.
 */
export async function inviteStaff(userId: string, invitedBy: string, to: { name: string; email: string; role: string }) {
  const db = await getDb();
  const token = randomBytes(32).toString("base64url");
  const [inv] = await db.insert(s.staffInvites).values({ userId, createdBy: invitedBy, tokenHash: hashInviteToken(token), expiresAt: inviteExpiry() }).returning({ id: s.staffInvites.id });
  try {
    await sendMail(to.email, "Convite para a equipe da Orbi", `Olá, ${to.name.split(" ")[0]}.

Você foi convidado(a) para a equipe da Orbi como ${ROLE_LABEL[to.role] ?? to.role}.

Para ativar a conta, abra o link abaixo, escolha a sua senha e ative a verificação em duas etapas (você vai precisar de um aplicativo autenticador no celular):

${inviteUrl(token)}

O link vale por ${Math.round(INVITE_TTL_MS / 3_600_000)} horas e só funciona uma vez. Se a conta não for ativada nesse prazo, ela é suspensa por segurança.
Se você não esperava este convite, ignore este e-mail.`);
  } catch (e) {
    await db.delete(s.staffInvites).where(eq(s.staffInvites.id, inv.id));
    throw e;
  }
}
