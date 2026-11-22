import { describe, expect, it } from "vitest";
import { ARRIVE_MAX_M, arriveProblem, completeProblem, effectiveCommissionBps, minTripSeconds } from "@/shared/ride-guards";

const origin = { lat: -19.47, lng: -42.54 };
const dest = { lat: -19.5186, lng: -42.6289 };
const now = new Date("2026-01-01T12:00:00Z");
const at = (p: { lat: number; lng: number }, ageMs = 5000) => ({ ...p, at: new Date(now.getTime() - ageMs) });
// ~0,0009 grau de latitude = ~100 m
const near = (p: { lat: number; lng: number }, deg: number) => ({ lat: p.lat + deg, lng: p.lng });

describe("cheguei (arrive)", () => {
  it("aceita perto da partida", () => expect(arriveProblem(at(near(origin, 0.0009)), origin, now)).toBeNull());
  it("recusa longe da partida, dizendo a distância", () => {
    expect(arriveProblem(at(near(origin, 0.01)), origin, now)).toMatch(new RegExp(`até ${ARRIVE_MAX_M} m`));
  });
  it("recusa sem posição ou com posição velha", () => {
    expect(arriveProblem(null, origin, now)).toMatch(/Não sabemos onde você está/);
    expect(arriveProblem({ lat: null, lng: null, at: null }, origin, now)).toMatch(/Não sabemos/);
    expect(arriveProblem(at(origin, 5 * 60_000), origin, now)).toMatch(/desatualizada/);
  });
});

describe("encerrar viagem (complete)", () => {
  const started = (s: number) => new Date(now.getTime() - s * 1000);
  it("tempo mínimo: 30% da duração, nunca menos de 1 min", () => {
    expect(minTripSeconds(100)).toBe(60);
    expect(minTripSeconds(1000)).toBe(300);
    expect(minTripSeconds(1000, { minFraction: 0, minFloorS: 0 })).toBe(0);
  });
  it("recusa cedo demais mesmo no destino", () => {
    expect(completeProblem(at(dest), dest, started(30), 1000, now)).toMatch(/acabou de começar/);
  });
  it("aceita no destino depois do tempo mínimo", () => {
    expect(completeProblem(at(near(dest, 0.002)), dest, started(400), 1000, now)).toBeNull();
  });
  it("recusa longe do destino", () => {
    expect(completeProblem(at(origin), dest, started(4000), 1000, now)).toMatch(/do destino/);
  });
  it("recusa posição ausente ou velha", () => {
    expect(completeProblem(null, dest, started(4000), 1000, now)).toMatch(/Não sabemos/);
    expect(completeProblem(at(dest, 10 * 60_000), dest, started(4000), 1000, now)).toMatch(/desatualizada/);
  });
});

describe("comissão efetiva (plano só reduz)", () => {
  it("sem plano, tarifa", () => expect(effectiveCommissionBps(1800, null)).toBe(1800));
  it("plano menor reduz", () => expect(effectiveCommissionBps(1500, { tier: "plus", commissionBps: 1400 })).toBe(1400));
  it("plano maior que a tarifa não aumenta", () => expect(effectiveCommissionBps(1200, { tier: "pro", commissionBps: 1400 })).toBe(1200));
  it("Básico mantém a da tarifa (termo do plano)", () => expect(effectiveCommissionBps(1800, { tier: "basico", commissionBps: 1500 })).toBe(1800));
});
