/**
 * Regras puras de custo e de preço do Orbi Food. Percentuais em pontos-base (100 = 1%).
 *
 * Decisão do dono: o Orbi Food cobra 14% TUDO INCLUÍDO na entrega própria do restaurante (pagamento online incluso, sem
 * mensalidade e sem taxa extra). A regra de referência é ficar 1 ponto abaixo do CUSTO TOTAL do concorrente, nunca abaixo do
 * piso de 6%: priceBelowCompetitor serve para conferir se o preço decidido segue de pé quando o concorrente mudar.
 */

/**
 * Custo total em % das vendas: comissão + pagamento online + a mensalidade diluída nas vendas do mês.
 * Sem vendas, a mensalidade não vira percentual (fica só comissão + pagamento). Entradas inválidas contam como zero.
 */
export function effectiveCostBps(commissionBps: number, paymentBps: number, monthlyFeeCents: number, monthlySalesCents: number): number {
  const n = (v: number) => (Number.isFinite(v) && v > 0 ? v : 0);
  const sales = n(monthlySalesCents);
  const monthlyBps = sales > 0 ? (n(monthlyFeeCents) / sales) * 10000 : 0;
  return Math.round(n(commissionBps) + n(paymentBps) + monthlyBps);
}

/** Preço 1 ponto abaixo do custo total do concorrente, nunca abaixo do piso (padrão 6%). Concorrente de taxa zero cai no piso. */
export function priceBelowCompetitor(competitorEffectiveBps: number, stepBps = 100, floorBps = 600): number {
  const comp = Number.isFinite(competitorEffectiveBps) ? Math.max(0, competitorEffectiveBps) : 0;
  const step = Number.isFinite(stepBps) ? Math.max(0, stepBps) : 0;
  return Math.max(Math.round(floorBps), Math.round(comp - step));
}
