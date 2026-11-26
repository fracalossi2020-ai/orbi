import { describe, expect, it } from "vitest";
import { compareFees, MARKET_REFERENCE, parseReais } from "@/shared/food/calculator";
import { effectiveCostBps, priceBelowCompetitor } from "@/shared/food/commission";
import { FOOD_COMMISSIONS, ORBI_FOOD_BPS } from "@/shared/food/demo-data";

const base = { ordersPerMonth: 1000, ticketCents: 5000, orbiBps: ORBI_FOOD_BPS };

describe("Orbi Food: custo efetivo e preço abaixo do concorrente", () => {
  it("effectiveCostBps soma comissão, pagamento e a mensalidade diluída nas vendas", () => {
    // iFood Básico: 12% + 3,2% + R$ 110 sobre R$ 5.000 (2,2%) = 17,4%
    expect(effectiveCostBps(1200, 320, 11_000, 500_000)).toBe(1740);
    // Vendas maiores diluem a mensalidade: R$ 50.000 -> 0,22%
    expect(effectiveCostBps(1200, 320, 11_000, 5_000_000)).toBe(1542);
    expect(effectiveCostBps(1400, 0, 0, 500_000)).toBe(1400);
    expect(effectiveCostBps(1200, 320, 11_000, 0)).toBe(1520);
    expect(effectiveCostBps(Number.NaN, -5, 11_000, 500_000)).toBe(220);
  });

  it("priceBelowCompetitor fica 1 ponto abaixo do custo total, com piso de 6%", () => {
    expect(priceBelowCompetitor(1740)).toBe(1640);
    expect(priceBelowCompetitor(1740, 50)).toBe(1690);
    expect(priceBelowCompetitor(650)).toBe(600);
    expect(priceBelowCompetitor(0)).toBe(600); // concorrente com taxa zero cai no piso
    expect(priceBelowCompetitor(Number.NaN)).toBe(600);
    expect(priceBelowCompetitor(300, 100, 0)).toBe(200);
  });

  it("os 14% decididos ficam abaixo do custo total do iFood Básico em qualquer volume razoável", () => {
    const ib = MARKET_REFERENCE.ifoodBasico;
    for (const sales of [200_000, 500_000, 1_350_000, 5_000_000, 50_000_000]) {
      const comp = effectiveCostBps(ib.commissionBps, ib.paymentBps, ib.monthlyCents, sales);
      expect(ORBI_FOOD_BPS).toBeLessThan(comp);
    }
  });

  it("tabela de comissões: 14% tudo incluído na entrega própria e na retirada; entrega Orbi em breve, sem número", () => {
    const by = Object.fromEntries(FOOD_COMMISSIONS.map((c) => [c.id, c]));
    expect(by.own_delivery.bps).toBe(1400);
    expect(by.pickup.bps).toBe(1400);
    expect(by.orbi_delivery.bps).toBeNull();
    expect(by.orbi_delivery.soon).toBe(true);
    expect(FOOD_COMMISSIONS.some((c) => c.bps === 650 || c.bps === 1100 || c.bps === 2200)).toBe(false);
  });
});

describe("Orbi Food: calculadora em reais por mês", () => {
  it("1.000 pedidos x R$ 50,00: iFood Básico R$ 7.710, iFood Entrega R$ 13.250, Orbi R$ 7.000", () => {
    const r = compareFees(base);
    expect(r.salesCents).toBe(5_000_000);
    const by = Object.fromEntries(r.rows.map((x) => [x.id, x]));
    expect(by.orbi.feeCents).toBe(700_000);
    expect(by.orbi.monthlyCents).toBe(0);
    expect(by.orbi.netCents).toBe(4_300_000);
    expect(by.ifood_basico.feeCents).toBe(760_000 + 11_000);
    expect(by.ifood_entrega.feeCents).toBe(1_310_000 + 15_000);
    expect(r.savingsMonthCents).toBe(71_000);
    expect(r.savingsYearCents).toBe(852_000);
    expect(r.savingsVsEntregaMonthCents).toBe(625_000);
  });

  it("99Food é só referência, com faixa de comissão", () => {
    const f = compareFees(base).rows.find((x) => x.id === "food99")!;
    expect(f.feeCents).toBe(605_000);
    expect(f.feeMaxCents).toBe(760_000);
    expect(MARKET_REFERENCE.food99.servesValeDoAco).toBe(false);
  });

  it("percentual efetivo é secundário mas correto, e a Orbi é a mais barata mesmo com 1 pedido", () => {
    const r = compareFees({ ...base, ordersPerMonth: 300, ticketCents: 4500 });
    expect(r.rows.find((x) => x.id === "orbi")!.effectiveBps).toBe(1400);
    expect(r.rows.find((x) => x.id === "ifood_basico")!.effectiveBps).toBe(1601); // 15,2% + R$ 110 / R$ 13.500
    expect(r.savingsMonthCents).toBe(27_200);
    expect(compareFees({ ...base, ordersPerMonth: 1, ticketCents: 4500 }).savingsMonthCents).toBeGreaterThan(0);
    expect(MARKET_REFERENCE.asOf).toBe("nov/2026");
  });

  it("entradas inválidas viram zero e pedidos fracionados arredondam para baixo", () => {
    expect(compareFees({ ...base, ordersPerMonth: -3 }).salesCents).toBe(0);
    expect(compareFees({ ...base, ordersPerMonth: Number.NaN }).salesCents).toBe(0);
    expect(compareFees({ ...base, ticketCents: Infinity }).salesCents).toBe(0);
    expect(compareFees({ ...base, ordersPerMonth: 10.9 }).salesCents).toBe(10 * 5000);
  });

  it("lê valores em reais", () => {
    expect(parseReais("45")).toBe(4500);
    expect(parseReais("45,5")).toBe(4550);
    expect(parseReais("R$ 1.234,50")).toBe(123450);
    expect(parseReais("0,05")).toBe(5);
    for (const v of ["", "abc", "-5", "1,234", "1.23", "45,"]) expect(parseReais(v)).toBeNull();
  });
});
