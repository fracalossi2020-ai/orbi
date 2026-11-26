/**
 * Calculadora iFood x Orbi Food: quanto a loja paga POR MÊS, em reais (comissão + pagamento online + mensalidade),
 * e quanto fica no bolso. O percentual efetivo é só informação secundária. Percentuais em pontos-base (100 = 1%).
 *
 * REFERÊNCIA DE MERCADO, NOV/2026 (Serasa, Saipos, InfoMoney): valores públicos aproximados, sujeitos a mudança e ao plano/contrato
 * de cada loja. Conferir antes de usar fora da demonstração.
 *  - iFood Básico (entrega própria): 12% + 3,2% de pagamento online + mensalidade de R$ 110.
 *  - iFood Entrega (entrega do iFood): 23% + 3,2% de pagamento online + mensalidade de R$ 150.
 *  - 99Food: de 8,9% a 12% + 3,2%; AINDA NÃO ATENDE o Vale do Aço (só referência).
 *  - Orbi Food: 14% TUDO INCLUÍDO na entrega própria (pagamento online incluso, sem mensalidade). Entrega Orbi: em breve, sem número.
 */
import { effectiveCostBps } from "./commission";

export const MARKET_REFERENCE = {
  asOf: "nov/2026",
  source: "Serasa, Saipos, InfoMoney",
  ifoodBasico: { commissionBps: 1200, paymentBps: 320, monthlyCents: 11_000 },
  ifoodEntrega: { commissionBps: 2300, paymentBps: 320, monthlyCents: 15_000 },
  food99: { minBps: 890, maxBps: 1200, paymentBps: 320, servesValeDoAco: false },
} as const;

export type CalcId = "orbi" | "ifood_basico" | "ifood_entrega" | "food99";
export type CalcInput = { ordersPerMonth: number; ticketCents: number; orbiBps: number };
export type CalcRow = {
  id: CalcId; label: string;
  commissionBps: number; paymentBps: number; monthlyCents: number;
  /** Total pago no mês, em centavos. No 99Food é o valor com a menor comissão da faixa. */
  feeCents: number;
  /** Só no 99Food: total com a maior comissão da faixa. */
  feeMaxCents?: number;
  /** Custo total em % das vendas (informação secundária). */
  effectiveBps: number;
  netCents: number;
};
export type CalcResult = {
  salesCents: number; rows: CalcRow[];
  /** Quanto fica no bolso por mês escolhendo o Orbi Food, contra o iFood Básico (o mais barato confirmado no Vale do Aço). */
  savingsMonthCents: number; savingsYearCents: number;
  /** Contra o iFood Entrega. */
  savingsVsEntregaMonthCents: number;
};

const row = (id: CalcId, label: string, sales: number, commissionBps: number, paymentBps: number, monthlyCents: number): CalcRow => {
  const feeCents = Math.round((sales * (commissionBps + paymentBps)) / 10000) + monthlyCents;
  return { id, label, commissionBps, paymentBps, monthlyCents, feeCents, effectiveBps: effectiveCostBps(commissionBps, paymentBps, monthlyCents, sales), netCents: sales - feeCents };
};

/** Entradas inválidas (negativas, não finitas) viram 0; pedidos por mês arredonda para baixo. */
export function compareFees(input: CalcInput, ref = MARKET_REFERENCE): CalcResult {
  const orders = Number.isFinite(input.ordersPerMonth) ? Math.max(0, Math.floor(input.ordersPerMonth)) : 0;
  const ticket = Number.isFinite(input.ticketCents) ? Math.max(0, Math.round(input.ticketCents)) : 0;
  const sales = orders * ticket;
  const orbi = row("orbi", "Orbi Food", sales, input.orbiBps, 0, 0);
  const basico = row("ifood_basico", "iFood Básico", sales, ref.ifoodBasico.commissionBps, ref.ifoodBasico.paymentBps, ref.ifoodBasico.monthlyCents);
  const entrega = row("ifood_entrega", "iFood Entrega", sales, ref.ifoodEntrega.commissionBps, ref.ifoodEntrega.paymentBps, ref.ifoodEntrega.monthlyCents);
  const f99 = row("food99", "99Food", sales, ref.food99.minBps, ref.food99.paymentBps, 0);
  f99.feeMaxCents = row("food99", "99Food", sales, ref.food99.maxBps, ref.food99.paymentBps, 0).feeCents;
  const savingsMonthCents = basico.feeCents - orbi.feeCents;
  return { salesCents: sales, rows: [orbi, basico, entrega, f99], savingsMonthCents, savingsYearCents: savingsMonthCents * 12, savingsVsEntregaMonthCents: entrega.feeCents - orbi.feeCents };
}

/** "45", "45,5" ou "1.234,50" em centavos; null se não for um valor. */
export function parseReais(text: string): number | null {
  const t = text.trim().replace(/^R\$\s*/i, "");
  if (!/^\d{1,3}(\.\d{3})*(,\d{1,2})?$|^\d+(,\d{1,2})?$/.test(t)) return null;
  const [int, dec = ""] = t.replace(/\./g, "").split(",");
  return Number(int) * 100 + Number(dec.padEnd(2, "0"));
}
