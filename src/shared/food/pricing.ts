import type { CartLine, ChosenOption, FoodItem, Fulfillment, OptionGroup } from "./types";

/**
 * Regras de preço do Orbi Food. Tudo em centavos inteiros.
 * A comissão incide só sobre o subtotal dos itens (não sobre a taxa de entrega, que é da loja com entrega própria).
 * O percentual NUNCA fica aqui: vem de FOOD_COMMISSIONS (demo-data.ts) e é passado por quem chama.
 */

/** Soma dos opcionais de uma linha, por unidade. */
export const optionsCents = (line: Pick<CartLine, "options">) => line.options.reduce((s, o) => s + o.extraCents, 0);

export const unitCents = (line: Pick<CartLine, "baseCents" | "options">) => line.baseCents + optionsCents(line);

export const lineTotalCents = (line: Pick<CartLine, "baseCents" | "options" | "qty">) => unitCents(line) * line.qty;

export const subtotalCents = (lines: CartLine[]) => lines.reduce((s, l) => s + lineTotalCents(l), 0);

export const itemCount = (lines: CartLine[]) => lines.reduce((s, l) => s + l.qty, 0);

/** Taxa de entrega cobrada: retirada não paga, e loja sem entrega (null) também não cobra. */
export function deliveryFee(storeFeeCents: number | null, f: Fulfillment): number {
  return f === "delivery" && storeFeeCents !== null ? Math.max(0, Math.round(storeFeeCents)) : 0;
}

export const commissionCents = (subtotal: number, bps: number) => Math.round((subtotal * bps) / 10000);

export type FoodQuote = {
  subtotalCents: number; deliveryFeeCents: number; totalCents: number;
  commissionBps: number; commissionCents: number;
  /** O que a loja recebe: subtotal menos a comissão, mais a taxa de entrega (entrega própria). */
  storeNetCents: number;
};

export function quoteOrder(lines: CartLine[], f: Fulfillment, storeFeeCents: number | null, commissionBps: number): FoodQuote {
  const sub = subtotalCents(lines);
  const fee = deliveryFee(storeFeeCents, f);
  const commission = commissionCents(sub, commissionBps);
  return { subtotalCents: sub, deliveryFeeCents: fee, totalCents: sub + fee, commissionBps, commissionCents: commission, storeNetCents: sub - commission + fee };
}

/** Erro de um grupo para os ids escolhidos, ou null. Escolhas fora do grupo ou repetidas contam como erro. */
export function groupError(g: OptionGroup, chosen: string[]): string | null {
  const valid = new Set(g.options.map((o) => o.id));
  if (chosen.some((id) => !valid.has(id)) || new Set(chosen).size !== chosen.length) return "Escolha inválida.";
  if (g.required && chosen.length < 1) return g.max === 1 ? "Escolha uma opção." : "Escolha ao menos uma opção.";
  if (chosen.length > g.max) return `Escolha até ${g.max}.`;
  return null;
}

/** Erros por grupo (só os que têm erro). */
export function selectionErrors(item: FoodItem, selection: Record<string, string[]>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const g of item.groups ?? []) {
    const e = groupError(g, selection[g.id] ?? []);
    if (e) out[g.id] = e;
  }
  return out;
}

/** Chave estável da configuração (item + opcionais em ordem fixa): o mesmo prato igual soma a quantidade. */
export const lineKey = (itemId: string, options: Pick<ChosenOption, "groupId" | "optionId">[]) =>
  [itemId, ...options.map((o) => `${o.groupId}:${o.optionId}`).sort()].join("|");

/** Monta a linha a partir da seleção; devolve null se faltar algo obrigatório ou a quantidade for inválida. */
export function buildLine(item: FoodItem, selection: Record<string, string[]>, qty: number): CartLine | null {
  if (!Number.isInteger(qty) || qty < 1 || qty > 20) return null;
  if (Object.keys(selectionErrors(item, selection)).length) return null;
  const options: ChosenOption[] = [];
  for (const g of item.groups ?? []) {
    for (const id of selection[g.id] ?? []) {
      const o = g.options.find((x) => x.id === id)!;
      options.push({ groupId: g.id, optionId: o.id, label: o.label, extraCents: o.extraCents });
    }
  }
  return { key: lineKey(item.id, options), itemId: item.id, name: item.name, baseCents: item.priceCents, options, qty };
}

/** Soma uma linha ao carrinho (linhas iguais juntam; teto de 20 por linha). */
export function addLine(lines: CartLine[], line: CartLine): CartLine[] {
  const i = lines.findIndex((l) => l.key === line.key);
  if (i < 0) return [...lines, line];
  return lines.map((l, j) => (j === i ? { ...l, qty: Math.min(20, l.qty + line.qty) } : l));
}

/** Muda a quantidade; 0 ou menos remove a linha. */
export function setQty(lines: CartLine[], key: string, qty: number): CartLine[] {
  if (qty <= 0) return lines.filter((l) => l.key !== key);
  return lines.map((l) => (l.key === key ? { ...l, qty: Math.min(20, Math.floor(qty)) } : l));
}
