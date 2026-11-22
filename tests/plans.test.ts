import { describe, expect, it } from "vitest";
import { PLAN_GENERAL_TERMS, PLAN_SPECS, planSpec } from "@/shared/plans";

describe("planos do motorista", () => {
  const [basico, plus, pro] = ["basico", "plus", "pro"].map((t) => planSpec(t)!);

  it("tem os três planos com os preços combinados", () => {
    expect(PLAN_SPECS.map((p) => [p.tier, p.priceCents])).toEqual([["basico", 9900], ["plus", 16900], ["pro", 28900]]);
  });

  it("cada plano acima dá mais que o de baixo", () => {
    for (const [lo, hi] of [[basico, plus], [plus, pro]]) {
      expect(hi.commissionBps).toBeLessThan(lo.commissionBps + 1);
      expect(hi.laborDiscountBps).toBeGreaterThan(lo.laborDiscountBps);
      expect(hi.monthlyCreditCents).toBeGreaterThanOrEqual(lo.monthlyCreditCents);
      expect(hi.checkupEveryDays).toBeLessThan(lo.checkupEveryDays);
      expect(hi.benefits.length).toBeGreaterThan(lo.benefits.length);
    }
    // O Pro é bem mais completo que o Plus.
    expect(pro.benefits.length - plus.benefits.length).toBeGreaterThanOrEqual(3);
  });

  it("só os planos maiores têm crédito, e com limite", () => {
    expect(basico.monthlyCreditCents).toBe(0);
    expect(plus.monthlyCreditCents).toBeGreaterThan(0);
    // O crédito nunca passa do preço do plano: o custo da Orbi tem teto.
    for (const p of PLAN_SPECS) expect(p.monthlyCreditCents).toBeLessThan(p.priceCents);
  });

  it("os termos dizem que não é seguro e explicam o cancelamento", () => {
    const all = PLAN_GENERAL_TERMS.flatMap((g) => g.items).join(" ");
    expect(all).toMatch(/Não é seguro/);
    expect(all).toMatch(/7 dias/);
    for (const p of PLAN_SPECS) expect(p.terms.length).toBeGreaterThan(0);
  });

  it("plano sem tier não tem catálogo", () => {
    expect(planSpec(null)).toBeNull();
    expect(planSpec("ouro")).toBeNull();
  });
});

describe("líquido da oferta = líquido liquidado (B1)", () => {
  it("a comissão do plano só reduz a da tarifa, e o líquido sai da mesma conta", async () => {
    const { driverFare } = await import("@/shared/ride-guards");
    // Tarifa 20%: plano Pro de 10% reduz; Básico (mesmo com número menor gravado) mantém a da tarifa; plano mais caro nunca aumenta.
    expect(driverFare(10000, 2000, { tier: "pro", commissionBps: 1000 })).toEqual({ commissionBps: 1000, commissionCents: 1000, driverNetCents: 9000 });
    expect(driverFare(10000, 2000, { tier: "basico", commissionBps: 500 })).toEqual({ commissionBps: 2000, commissionCents: 2000, driverNetCents: 8000 });
    expect(driverFare(10000, 1500, { tier: "plus", commissionBps: 2500 }).commissionBps).toBe(1500);
    expect(driverFare(10000, 1500, null).driverNetCents).toBe(8500);
    expect(driverFare(3333, 1750, null)).toEqual({ commissionBps: 1750, commissionCents: 583, driverNetCents: 2750 });
  });
});
