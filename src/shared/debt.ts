/**
 * Dívida do motorista com a Orbi. Nas corridas em dinheiro e no Pix direto na chave do motorista, a parte da Orbi
 * vira saldo negativo. Regras puras (sem I/O): limite, aviso, bloqueio e validação do pedido de quitação.
 */

/** Limite padrão da dívida: R$ 150. Editável em /admin/configuracoes. */
export const DEFAULT_DEBT_LIMIT_CENTS = 15000;
/** A partir de 70% do limite o app avisa. */
export const DEBT_WARN_RATIO = 0.7;
export const DEBT_BLOCK_MESSAGE = "Quite o saldo com a Orbi para voltar a dirigir";

export type DebtLevel = "ok" | "warn" | "blocked";

/** Quanto o motorista deve (sempre >= 0), em centavos. */
export const debtCents = (balanceCents: number) => Math.max(0, -balanceCents);

/** saldo <= -limite: bloqueado; saldo <= -70% do limite: aviso; senão, ok. Limite 0 ou inválido: sem bloqueio. */
export function debtLevel(balanceCents: number, limitCents: number): DebtLevel {
  if (!Number.isFinite(limitCents) || limitCents <= 0) return "ok";
  if (balanceCents <= -limitCents) return "blocked";
  if (balanceCents <= -Math.round(limitCents * DEBT_WARN_RATIO)) return "warn";
  return "ok";
}

/** Erro de validação do pedido "Já paguei" (ou null). O valor nunca passa da dívida: a quitação não cria dinheiro. */
export function settlementProblem(amountCents: number, balanceCents: number): string | null {
  if (!Number.isInteger(amountCents) || amountCents <= 0) return "Informe o valor que você pagou.";
  if (balanceCents >= 0) return "Você não tem dívida com a Orbi.";
  if (amountCents > debtCents(balanceCents)) return "O valor não pode ser maior que o que você deve.";
  return null;
}
