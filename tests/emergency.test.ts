import { describe, expect, it } from "vitest";
import { emergencyScript, mapLink, parseSosPoint, staffEmail, trustedMessage, vehicleText, whatsappUrl } from "@/shared/emergency";

const car = { make: "Fiat", model: "Argo", color: "prata", plate: "ABC1D23" };

describe("posição do alerta de emergência", () => {
  it("aceita coordenadas finitas e dentro do globo", () => {
    expect(parseSosPoint({ lat: -19.47, lng: -42.54 })).toEqual({ lat: -19.47, lng: -42.54 });
  });
  it("recusa texto, nulo, infinito, NaN e fora de faixa", () => {
    for (const bad of [null, undefined, "x", {}, { lat: "1", lng: 2 }, { lat: NaN, lng: 1 }, { lat: Infinity, lng: 1 }, { lat: 91, lng: 0 }, { lat: 0, lng: -181 }]) expect(parseSosPoint(bad)).toBeNull();
  });
});

describe("roteiro para o 190", () => {
  it("passageiro: modelo, cor, placa e endereço", () => {
    expect(vehicleText(car)).toBe("Fiat Argo prata");
    expect(emergencyScript({ as: "passenger", vehicle: car, place: "Av. Cardoso, Ipatinga" })).toBe("Estou num carro Fiat Argo prata, placa ABC1D23, perto de Av. Cardoso, Ipatinga.");
  });
  it("sem endereço usa as coordenadas", () => {
    expect(emergencyScript({ as: "passenger", vehicle: car, point: { lat: -19.4712, lng: -42.5401 } })).toContain("coordenadas -19.47120, -42.54010");
  });
  it("motorista fala do passageiro e da posição", () => {
    const t = emergencyScript({ as: "driver", vehicle: car, place: "Rua A", passengerName: "Ana" });
    expect(t).toContain("passageiro Ana");
    expect(t).toContain("placa ABC1D23");
    expect(t).toContain("perto de Rua A");
  });
  it("não quebra sem dados", () => {
    expect(emergencyScript({ as: "passenger" })).toContain("local não identificado");
  });
});

describe("mensagem para alguém de confiança", () => {
  it("leva placa, mapa e o link ao vivo, e codifica para o WhatsApp", () => {
    const msg = trustedMessage({ as: "passenger", vehicle: car, point: { lat: -19.5, lng: -42.5 }, liveUrl: "https://orbi.test/v/abc" });
    expect(msg).toContain("placa ABC1D23");
    expect(msg).toContain("https://orbi.test/v/abc");
    expect(msg).toContain(mapLink({ lat: -19.5, lng: -42.5 }));
    expect(whatsappUrl(msg).startsWith("https://wa.me/?text=")).toBe(true);
    expect(whatsappUrl(msg)).not.toContain("\n");
  });
});

describe("e-mail da equipe", () => {
  it("traz o painel, as posições e não promete plantão", () => {
    const m = staffEmail({ rideId: "11111111-2222-3333-4444-555555555555", as: "driver", at: new Date("2026-01-01T12:00:00Z"), panelUrl: "https://orbi.test/admin/emergencias", points: [{ label: "Motorista", point: { lat: 1, lng: 2 } }, { label: "Passageiro", point: null }] });
    expect(m.subject).toContain("11111111");
    expect(m.text).toContain("motorista");
    expect(m.text).toContain("https://orbi.test/admin/emergencias");
    expect(m.text).toContain("Passageiro: sem posição conhecida");
    expect(m.text).toContain("não é um plantão 24 horas");
  });
});
