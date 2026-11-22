import { describe, expect, it } from "vitest";
import { backTarget } from "@/shared/back-target";

const PASS = ["/passageiro", "/passageiro/viagens", "/passageiro/ajuda", "/passageiro/conta"];
const DRV = ["/motorista", "/motorista/ganhos", "/motorista/corridas", "/motorista/clube", "/motorista/ajuda", "/motorista/conta"];
const EX = { "/passageiro/dirigir": "/passageiro/conta" };

describe("backTarget", () => {
  it("na raiz não há seta (com barra final e query também)", () => {
    expect(backTarget("/passageiro", "/passageiro", PASS, EX)).toBeNull();
    expect(backTarget("/passageiro/", "/passageiro", PASS, EX)).toBeNull();
    expect(backTarget("/motorista?x=1", "/motorista", DRV)).toBeNull();
  });
  it("abas voltam para a raiz", () => {
    expect(backTarget("/passageiro/viagens", "/passageiro", PASS, EX)).toBe("/passageiro");
    expect(backTarget("/passageiro/ajuda/", "/passageiro", PASS, EX)).toBe("/passageiro");
    expect(backTarget("/motorista/ganhos?a=1", "/motorista", DRV)).toBe("/motorista");
  });
  it("exceção vale sobre o menu", () => {
    expect(backTarget("/passageiro/dirigir", "/passageiro", PASS, EX)).toBe("/passageiro/conta");
    expect(backTarget("/passageiro/dirigir/?q=1", "/passageiro", PASS, EX)).toBe("/passageiro/conta");
  });
  it("subtela usa o item de menu mais longo que é pai", () => {
    expect(backTarget("/motorista/clube/termos", "/motorista", DRV)).toBe("/motorista/clube");
  });
  it("não confunde prefixo parcial e cai na raiz sem pai", () => {
    expect(backTarget("/motorista/clubes", "/motorista", DRV)).toBe("/motorista");
    expect(backTarget("/passageiro/outra", "/passageiro", PASS)).toBe("/passageiro");
  });
});
