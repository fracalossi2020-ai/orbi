import { describe, expect, it } from "vitest";
import { FREE_TIER, PAID_PLANS_ENABLED_AT_LAUNCH, PLAN_GENERAL_TERMS, PLAN_SPECS, planSpec, planSubscribeError } from "@/shared/plans";

describe("Clube do motorista", () => {
  const [plus, pro] = ["plus", "pro"].map((t) => planSpec(t)!);

  it("não existe mais o Básico pago, só Plus e Pro com os valores novos", () => {
    expect(PLAN_SPECS.map((p) => [p.tier, p.priceCents, p.commissionBps, p.monthlyCreditCents])).toEqual([["plus", 12900, 1400, 4000], ["pro", 28900, 1300, 8000]]);
    expect(planSpec("basico")).toBeNull();
    expect(pro.benefits.join(" ")).toMatch(/até R\$ 150/);
  });

  it("os planos pagos nascem desligados e o nível grátis não promete crédito nem comissão", () => {
    expect(PAID_PLANS_ENABLED_AT_LAUNCH).toBe(false);
    const gratis = FREE_TIER.benefits.join(" ");
    expect(gratis).not.toMatch(/crédito|comissão|R\$/);
    expect(gratis).toMatch(/oficinas parceiras/);
  });

  it("o Pro dá mais que o Plus, e o crédito nunca passa do preço", () => {
    expect(pro.commissionBps).toBeLessThan(plus.commissionBps);
    expect(pro.laborDiscountBps).toBeGreaterThan(plus.laborDiscountBps);
    expect(pro.checkupEveryDays).toBeLessThan(plus.checkupEveryDays);
    expect(pro.benefits.length - plus.benefits.length).toBeGreaterThanOrEqual(3);
    for (const p of PLAN_SPECS) expect(p.monthlyCreditCents).toBeLessThan(p.priceCents);
  });

  it("assinar plano desligado dá 409, e plano inexistente 404", () => {
    expect(planSubscribeError({ active: false })).toEqual({ status: 409, message: "Este plano ainda não está disponível." });
    expect(planSubscribeError(null)?.status).toBe(404);
    expect(planSubscribeError({ active: true })).toBeNull();
  });

  it("os termos dizem que não é seguro, explicam o cancelamento e não citam o Básico", () => {
    const all = PLAN_GENERAL_TERMS.flatMap((g) => g.items).join(" ");
    expect(all).toMatch(/Não é seguro|não é seguro/i);
    expect(all).toMatch(/7 dias/);
    expect(JSON.stringify([PLAN_GENERAL_TERMS, PLAN_SPECS, FREE_TIER])).not.toMatch(/Básico/);
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
