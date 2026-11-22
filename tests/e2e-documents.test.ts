import { describe, expect, it } from "vitest";
import { isValidCnh, isValidCpf } from "@/shared/validation";
import { makeCnh, validCpf } from "../e2e/documents";

// Os testes de ponta a ponta criam contas com estes geradores: um CPF recusado pelo app quebraria a suíte toda.
describe("geradores de documentos dos testes de ponta a ponta", () => {
  it("CPF gerado sempre passa na validação do app e nunca repete o mesmo número", () => {
    for (let i = 0; i < 2000; i++) {
      const cpf = validCpf();
      expect(cpf).toMatch(/^\d{11}$/);
      expect(isValidCpf(cpf)).toBe(true);
      expect(/^(\d)\1+$/.test(cpf)).toBe(false);
    }
  });

  it("CNH gerada sempre passa na validação do app", () => {
    for (let i = 0; i < 2000; i++) expect(isValidCnh(makeCnh())).toBe(true);
  });

  it("CPFs gerados variam (os cadastros não colidem)", () => {
    expect(new Set(Array.from({ length: 200 }, validCpf)).size).toBeGreaterThan(195);
  });
});
