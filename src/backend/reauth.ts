import { z } from "zod";
import { ApiError } from "./api";
import { verifyPassword, type SessionUser } from "./auth";
import { isRateLimitedDb, rateLimitDb, resetLimitDb } from "./rate-limit-db";
import { sendCode, useCode } from "./codes";

/**
 * Reautenticação antes de ações que movem dinheiro ou apagam a conta (saque, troca da chave Pix, exclusão).
 * Conta com senha: a senha atual. Conta do Google (sem senha própria): código enviado ao e-mail atual já confirmado,
 * o mesmo caminho da troca de e-mail (purpose "reauth", separado para não misturar com a etapa da troca de e-mail).
 */
export const reauthFields = {
  password: z.string().max(128).optional(),
  code: z.string().trim().regex(/^\d{6}$/, "Digite os 6 números do código.").optional(),
};
export type ReauthInput = { password?: string; code?: string };

const viaEmail = (user: SessionUser) => Boolean(user.googleSub);

/** Envia o código de confirmação (contas do Google). Contas com senha não usam código. */
export async function sendReauthCode(user: SessionUser) {
  if (!viaEmail(user)) throw new ApiError(400, "Sua conta usa senha: informe a senha atual.");
  if (!user.email || !user.emailVerifiedAt) throw new ApiError(409, "Confirme seu e-mail antes de continuar.");
  await sendCode(user, user.email, "reauth");
}

/**
 * Lança ApiError se a senha (ou o código) não confere. Só as falhas contam para o limite (5 a cada 15 min por conta,
 * como na troca de e-mail): pedidos legítimos em paralelo não se bloqueiam entre si, e quem erra não tenta para sempre.
 */
export async function requireReauth(user: SessionUser, input: ReauthInput) {
  const key = `reauth:${user.id}`;
  if (await isRateLimitedDb(key, 5)) throw new ApiError(429, "Muitas tentativas. Aguarde 15 minutos.");
  const fail = async (message: string, code?: string): Promise<never> => {
    await rateLimitDb(key, 5);
    throw new ApiError(400, message, code);
  };
  if (viaEmail(user)) {
    if (!input.code) throw new ApiError(400, "Peça o código de confirmação e digite-o aqui.", "reauth_code");
    try { await useCode(user.id, "reauth", input.code); } catch (e) { await rateLimitDb(key, 5); throw e; }
  } else {
    if (!input.password) throw new ApiError(400, "Informe sua senha atual para continuar.", "reauth_password");
    if (!(await verifyPassword(input.password, user.passwordHash))) await fail("A senha atual não confere.");
  }
  await resetLimitDb(key);
}
