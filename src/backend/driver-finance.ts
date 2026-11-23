import { and, eq, sql } from "drizzle-orm";
import { getDb, schema as s } from "@/database";
import { ApiError } from "./api";
import { planSubscribeError } from "@/shared/plans";
import { settlementProblem } from "@/shared/debt";

type Db = Awaited<ReturnType<typeof getDb>>;
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

/**
 * Trava a linha do motorista até o fim da transação. Pedidos simultâneos do mesmo motorista passam um de cada vez,
 * e cada um recalcula o saldo já com o lançamento do anterior (sem isso, dois saques lado a lado gastariam o mesmo saldo).
 */
async function lockDriver(tx: Tx, driverId: string) {
  const [row] = await tx.select({ userId: s.drivers.userId }).from(s.drivers).where(eq(s.drivers.userId, driverId)).for("update");
  if (!row) throw new ApiError(404, "Motorista não encontrado.");
}

/** Saldo do motorista (soma do livro-caixa), lido dentro da transação. */
async function balanceIn(tx: Tx, driverId: string) {
  const [{ total }] = await tx.select({ total: sql<number>`coalesce(sum(${s.ledger.amountCents}),0)::int` }).from(s.ledger).where(eq(s.ledger.driverId, driverId));
  return total;
}

/** Pede um saque: confere o saldo e lança o débito na mesma transação, com o motorista travado. */
export async function requestWithdrawal(driverId: string, v: { amountCents: number; pixKey: string }, minCents: number) {
  const db = await getDb();
  return db.transaction(async (tx) => {
    await lockDriver(tx, driverId);
    if (v.amountCents < minCents) throw new ApiError(400, "Valor abaixo do mínimo para saque.");
    if (v.amountCents > (await balanceIn(tx, driverId))) throw new ApiError(409, "Saldo insuficiente.");
    const [row] = await tx.insert(s.withdrawals).values({ driverId, ...v }).returning();
    await tx.insert(s.ledger).values({ driverId, type: "withdrawal", amountCents: -v.amountCents, description: "Saque solicitado" });
    return row;
  });
}

/** Assina (ou renova) um plano: confere o saldo, lança o débito e estende a validade na mesma transação. */
export async function subscribePlan(driverId: string, planId: string) {
  const db = await getDb();
  return db.transaction(async (tx) => {
    await lockDriver(tx, driverId);
    const [plan] = await tx.select().from(s.plans).where(eq(s.plans.id, planId));
    const erro = planSubscribeError(plan);
    if (erro) throw new ApiError(erro.status, erro.message);
    if ((await balanceIn(tx, driverId)) < plan.priceCents) throw new ApiError(409, "Saldo insuficiente para assinar este plano.");
    await tx.insert(s.ledger).values({ driverId, type: "plan", amountCents: -plan.priceCents, description: `Assinatura: ${plan.name}` });
    // Renovar o mesmo plano ainda ativo soma os dias; trocar de plano começa o novo hoje.
    const [me] = await tx.select({ planId: s.drivers.planId, planUntil: s.drivers.planUntil }).from(s.drivers).where(eq(s.drivers.userId, driverId));
    const from = me?.planId === plan.id && me.planUntil && me.planUntil > new Date() ? me.planUntil.getTime() : Date.now();
    await tx.update(s.drivers).set({ planId: plan.id, planUntil: new Date(from + plan.periodDays * 86400_000) }).where(eq(s.drivers.userId, driverId));
    return plan;
  });
}

/**
 * Admin trata um saque pedido. Marcar como pago é recusado se o saldo do motorista estiver negativo
 * (ele deve à Orbi, por exemplo por comissão de corridas em dinheiro). Recusar devolve o valor ao saldo.
 */
export async function settleWithdrawal(id: string, status: "paid" | "rejected", reviewerId: string) {
  const db = await getDb();
  return db.transaction(async (tx) => {
    const [current] = await tx.select().from(s.withdrawals).where(eq(s.withdrawals.id, id));
    if (!current || current.status !== "requested") throw new ApiError(409, "Este saque já foi tratado.");
    await lockDriver(tx, current.driverId);
    if (status === "paid" && (await balanceIn(tx, current.driverId)) < 0) {
      throw new ApiError(409, "O saldo do motorista está negativo. Recuse o saque ou acerte o saldo antes de pagar.");
    }
    const [row] = await tx.update(s.withdrawals).set({ status, reviewedBy: reviewerId })
      .where(and(eq(s.withdrawals.id, id), eq(s.withdrawals.status, "requested"))).returning();
    if (!row) throw new ApiError(409, "Este saque já foi tratado.");
    if (status === "rejected") {
      await tx.insert(s.ledger).values({ driverId: row.driverId, type: "withdrawal_reversal", amountCents: row.amountCents, description: "Saque recusado: valor devolvido ao saldo" });
    }
    return row;
  });
}

/** Motorista informa que pagou a dívida: cria um pedido pendente (no máximo 1). Não mexe no saldo. */
export async function requestSettlement(driverId: string, v: { amountCents: number; note: string }) {
  const db = await getDb();
  return db.transaction(async (tx) => {
    await lockDriver(tx, driverId);
    const problem = settlementProblem(v.amountCents, await balanceIn(tx, driverId));
    if (problem) throw new ApiError(409, problem);
    const [open] = await tx.select({ id: s.debtSettlements.id }).from(s.debtSettlements).where(and(eq(s.debtSettlements.driverId, driverId), eq(s.debtSettlements.status, "pending")));
    if (open) throw new ApiError(409, "Você já tem um pagamento em análise. Aguarde a equipe confirmar.");
    const [row] = await tx.insert(s.debtSettlements).values({ driverId, amountCents: v.amountCents, note: v.note }).returning();
    return row;
  });
}

/**
 * Equipe confirma ou recusa. Confirmar lança o crédito no ledger (única forma de a dívida baixar) na mesma transação,
 * com o motorista travado; recusar exige motivo. Devolve o pedido e o saldo depois do lançamento.
 */
export async function resolveSettlement(id: string, v: { status: "confirmed" | "rejected"; reason?: string }, reviewerId: string) {
  const db = await getDb();
  return db.transaction(async (tx) => {
    const [cur] = await tx.select().from(s.debtSettlements).where(eq(s.debtSettlements.id, id));
    if (!cur) throw new ApiError(404, "Pedido de quitação não encontrado.");
    await lockDriver(tx, cur.driverId);
    if (v.status === "rejected" && (v.reason ?? "").trim().length < 3) throw new ApiError(400, "Escreva o motivo da recusa.");
    const [row] = await tx.update(s.debtSettlements).set({ status: v.status, rejectReason: v.status === "rejected" ? v.reason!.trim() : null, reviewedBy: reviewerId, reviewedAt: new Date() })
      .where(and(eq(s.debtSettlements.id, id), eq(s.debtSettlements.status, "pending"))).returning();
    if (!row) throw new ApiError(409, "Este pedido já foi tratado.");
    if (v.status === "confirmed") {
      await tx.insert(s.ledger).values({ driverId: row.driverId, type: "debt_settlement", amountCents: row.amountCents, description: "Quitação com a Orbi confirmada" });
    }
    return { settlement: row, balanceCents: await balanceIn(tx, row.driverId) };
  });
}
