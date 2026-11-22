import { describe, expect, it } from "vitest";
import { MOTO_REQUIREMENTS, motoOfferedAt } from "@/shared/moto-soon";

const ipatinga = { lat: -19.47, lng: -42.54, radiusKm: 10, categories: [{ slug: "moto" }, { slug: "x" }] };
const timoteo = { lat: -19.58, lng: -42.65, radiusKm: 8, categories: [{ slug: "x" }] };

describe("Orbi Moto: em breve", () => {
  it("lista os requisitos principais", () => {
    expect(MOTO_REQUIREMENTS.length).toBe(8);
    expect(MOTO_REQUIREMENTS.join(" ")).toMatch(/930\/2022/);
  });
  it("sem ponto, vale qualquer cidade com moto; sem moto em nenhuma, não aparece", () => {
    expect(motoOfferedAt([timoteo, ipatinga])).toBe(true);
    expect(motoOfferedAt([timoteo])).toBe(false);
    expect(motoOfferedAt([])).toBe(false);
  });
  it("com ponto, só conta a cidade que cobre o passageiro", () => {
    expect(motoOfferedAt([timoteo, ipatinga], { lat: -19.47, lng: -42.54 })).toBe(true);
    expect(motoOfferedAt([timoteo, ipatinga], { lat: -19.58, lng: -42.65 })).toBe(false);
  });
});
