import { describe, expect, it } from "vitest";
import { DEFAULT_DEBT_LIMIT_CENTS, debtCents, debtLevel, settlementProblem } from "@/shared/debt";

describe("dívida do motorista com a Orbi", () => {
  const limit = DEFAULT_DEBT_LIMIT_CENTS;
  it("o limite padrão é R$ 150", () => expect(limit).toBe(15000));

  it("saldo positivo, zero ou pouco negativo não avisa nem bloqueia", () => {
    expect(debtLevel(5000, limit)).toBe("ok");
    expect(debtLevel(0, limit)).toBe("ok");
    expect(debtLevel(-10499, limit)).toBe("ok");
  });

  it("a partir de 70% do limite mostra aviso", () => {
    expect(debtLevel(-10500, limit)).toBe("warn");
    expect(debtLevel(-14999, limit)).toBe("warn");
  });

  it("no limite ou além, bloqueia", () => {
    expect(debtLevel(-15000, limit)).toBe("blocked");
    expect(debtLevel(-40000, limit)).toBe("blocked");
  });

  it("limite zero ou inválido desliga o bloqueio", () => {
    expect(debtLevel(-99999, 0)).toBe("ok");
    expect(debtLevel(-99999, Number.NaN)).toBe("ok");
  });

  it("dívida em centavos nunca é negativa", () => {
    expect(debtCents(-2300)).toBe(2300);
    expect(debtCents(900)).toBe(0);
  });

  it("o pedido de quitação não pode criar valor", () => {
    expect(settlementProblem(1000, -2300)).toBeNull();
    expect(settlementProblem(2300, -2300)).toBeNull();
    expect(settlementProblem(2301, -2300)).toMatch(/maior/);
    expect(settlementProblem(0, -2300)).toMatch(/valor/);
    expect(settlementProblem(10.5, -2300)).toMatch(/valor/);
    expect(settlementProblem(500, 100)).toMatch(/não tem dívida/);
  });
});
