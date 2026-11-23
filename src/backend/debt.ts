import { inArray, sql } from "drizzle-orm";
import { schema as s, type Db } from "@/database";
import { getSetting } from "@/database/seed";
import { DEFAULT_DEBT_LIMIT_CENTS, debtLevel } from "@/shared/debt";

/** Limite de dívida em centavos (configuração `debt` em /admin/configuracoes). */
export async function debtLimitCents(db: Db): Promise<number> {
  const v = await getSetting<{ limitCents?: number }>(db, "debt", { limitCents: DEFAULT_DEBT_LIMIT_CENTS });
  return Number.isInteger(v.limitCents) && v.limitCents! >= 0 ? v.limitCents! : DEFAULT_DEBT_LIMIT_CENTS;
}

/** Chave Pix de recebimento da Orbi, para o motorista quitar. Vazia até o admin preencher. */
export async function orbiPix(db: Db): Promise<{ key: string; name: string }> {
  const v = await getSetting<{ key?: string; name?: string }>(db, "orbiPix", {});
  return { key: v.key ?? "", name: v.name ?? "" };
}

/** Saldo de vários motoristas de uma vez (centavos). Quem não tem lançamento fica com 0. */
export async function balancesOf(db: Db, ids: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>(ids.map((id) => [id, 0]));
  if (!ids.length) return out;
  const rows = await db.select({ id: s.ledger.driverId, total: sql<number>`coalesce(sum(${s.ledger.amountCents}),0)::int` }).from(s.ledger).where(inArray(s.ledger.driverId, ids)).groupBy(s.ledger.driverId);
  for (const r of rows) out.set(r.id, r.total);
  return out;
}

/** Ids bloqueados por dívida (saldo <= -limite) entre os informados. */
export async function blockedByDebt(db: Db, ids: string[]): Promise<Set<string>> {
  const limit = await debtLimitCents(db);
  const balances = await balancesOf(db, ids);
  return new Set(ids.filter((id) => debtLevel(balances.get(id) ?? 0, limit) === "blocked"));
}
