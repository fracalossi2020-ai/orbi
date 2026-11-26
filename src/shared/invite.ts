/** Regras puras do convite para a equipe (testadas em tests/invite.test.ts). */
import { INVITE_TTL_MS } from "./sessions";

export type InviteState = { expiresAt: Date; usedAt: Date | null };

/** O convite ainda pode ser usado? */
export const inviteUsable = (i: InviteState, now = Date.now()) => !i.usedAt && i.expiresAt.getTime() > now;

export const inviteExpiry = (now = Date.now()) => new Date(now + INVITE_TTL_MS);

/**
 * Conta da equipe criada por convite que passou de 24 h sem ativar a segunda etapa (o convite venceu ou ficou pela metade):
 * o sweeper a suspende. Contas sem convite (a primeira, do script admin:create) nunca entram aqui.
 */
export function staffInviteOverdue(a: { invitedAt: Date | null; totpEnabledAt: Date | null; status: string }, now = Date.now()) {
  return a.status === "active" && !!a.invitedAt && !a.totpEnabledAt && now - a.invitedAt.getTime() > INVITE_TTL_MS;
}

/** O sweeper só cobra a segunda etapa em produção de verdade ou com a exigência ligada. */
export const enforceInviteSweep = (realProduction: boolean, mfaRequired: boolean) => realProduction || mfaRequired;
