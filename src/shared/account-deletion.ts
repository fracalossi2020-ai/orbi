/** Regras puras da exclusão de conta: o que a bloqueia e o bloqueio do CPF de quem saiu com histórico de motorista. */

export const CPF_BLOCK_DAYS = 180;
export const cpfBlockUntil = (now = new Date()) => new Date(now.getTime() + CPF_BLOCK_DAYS * 86400_000);

export type DeletionState = { balanceCents: number; openWithdrawals: number; pendingPixPayments?: number };

/** null quando pode excluir; senão a mensagem do 409. Saldo negativo é dívida com a Orbi e também bloqueia. */
export function deletionProblem(s: DeletionState): string | null {
  // Pix ainda aberto no provedor: se a conta sumisse agora, o pagamento (ou o crédito do motorista) ficaria sem dono.
  if ((s.pendingPixPayments ?? 0) > 0) return "Há um pagamento Pix aguardando confirmação. Conclua ou aguarde a confirmação do pagamento antes de excluir a conta.";
  if (s.openWithdrawals > 0) return "Acerte seu saldo antes de excluir a conta: há um saque aguardando pagamento.";
  if (s.balanceCents !== 0) return "Acerte seu saldo antes de excluir a conta: saque o que tem a receber ou quite o que deve à Orbi.";
  return null;
}

/**
 * Histórico REAL de motorista: corridas concluídas dirigindo (não como passageiro) ou lançamentos no saldo do motorista.
 * Corridas como passageiro não contam.
 */
export const hasDriverHistory = (o: { ridesAsDriver: number; ledgerRows: number }) => o.ridesAsDriver > 0 || o.ledgerRows > 0;

/** Só quem teve cadastro de motorista (com histórico de motorista) deixa o CPF bloqueado. */
export const shouldBlockCpf = (o: { wasDriver: boolean; hasHistory: boolean }) => o.wasDriver && o.hasHistory;

/** O bloqueio vale só para virar motorista de novo; entrar como passageiro com o mesmo CPF continua livre. */
export const CPF_DRIVER_BLOCKED_MESSAGE =
  "Este CPF pertencia a um cadastro de motorista excluído há pouco tempo e não pode voltar a ser motorista por enquanto. Você pode usar o app como passageiro. Se precisar, fale com o suporte.";
