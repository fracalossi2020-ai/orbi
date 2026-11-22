import { describe, expect, it } from "vitest";
import { ALREADY_DRIVER, becomeDriverProblem, CPF_NOT_ACCOUNT, normalizeIdentifier, OFFLINE_TO_REQUEST, onboardingCpfProblem, rideForExport, rideRequestProblem, staffUserView, STAFF_CANNOT_DRIVE } from "@/shared/account";

describe("virar motorista", () => {
  it("passageiro pode", () => {
    expect(becomeDriverProblem("passenger")).toBeNull();
  });
  it("quem já é motorista recebe aviso", () => {
    expect(becomeDriverProblem("driver")).toEqual({ status: 400, message: ALREADY_DRIVER });
  });
  it("equipe não pode", () => {
    for (const role of ["admin", "gestor", "atendente"] as const) {
      expect(becomeDriverProblem(role)).toEqual({ status: 403, message: STAFF_CANNOT_DRIVE });
    }
  });
});

describe("motorista pedindo corrida", () => {
  it("quem não é motorista pede normalmente", () => {
    expect(rideRequestProblem(null)).toBeNull();
  });
  it("motorista offline e sem corrida pede normalmente", () => {
    expect(rideRequestProblem({ online: false, activeRide: false })).toBeNull();
  });
  it("online ou em corrida como motorista, não", () => {
    expect(rideRequestProblem({ online: true, activeRide: false })).toBe(OFFLINE_TO_REQUEST);
    expect(rideRequestProblem({ online: false, activeRide: true })).toBe(OFFLINE_TO_REQUEST);
  });
});

describe("CPF no cadastro de motorista", () => {
  it("conta sem CPF (antiga) aceita o informado", () => {
    expect(onboardingCpfProblem(null, "52998224725")).toBeNull();
  });
  it("conta com CPF aceita só o mesmo", () => {
    expect(onboardingCpfProblem("52998224725", "52998224725")).toBeNull();
    expect(onboardingCpfProblem("52998224725", "11144477735")).toBe(CPF_NOT_ACCOUNT);
  });
});

describe("identificador de login normalizado", () => {
  it("e-mail em minúsculas e sem espaços", () => {
    expect(normalizeIdentifier("  ANA@Email.com ")).toBe("ana@email.com");
    expect(normalizeIdentifier("ana @email.com")).toBe("ana@email.com");
  });
  it("telefone só com dígitos, igual à busca", () => {
    expect(normalizeIdentifier("(31) 99999-8888")).toBe("31999998888");
    expect(normalizeIdentifier("31999998888")).toBe(normalizeIdentifier("+55 31 99999 8888".replace("+55 ", "")));
  });
  it("texto sem dígitos nem @ não vira chave vazia", () => {
    expect(normalizeIdentifier("  Abc ")).toBe("abc");
  });
});

describe("cópia dos dados (LGPD) e visão da equipe", () => {
  const ride = { id: "r", passengerId: "p1", driverId: "d1", riderName: "Joana", riderPhone: "31988887777", shareToken: "tok", originLabel: "A" };
  it("motorista não recebe dados do passageiro", () => {
    const out = rideForExport(ride, "d1") as Record<string, unknown>;
    for (const k of ["riderName", "riderPhone", "passengerId", "shareToken"]) expect(out).not.toHaveProperty(k);
    expect(out.originLabel).toBe("A");
  });
  it("passageiro recebe a própria corrida inteira", () => {
    expect(rideForExport(ride, "p1")).toEqual(ride);
  });
  it("lista da equipe sem segredos", () => {
    const u = { id: "1", name: "A", passwordHash: "x", totpSecret: "y", totpLastStep: 1, recoveryCodes: ["z"], googleSub: "g", pendingEmail: "n@x.com", email: "a@x.com" };
    expect(staffUserView(u)).toEqual({ id: "1", name: "A", email: "a@x.com" });
  });
});

describe("teto geral de CPF (M1/N4)", () => {
  it("endurecido, a mensagem não confirma que o CPF existe", async () => {
    const { cpfTakenMessage, CPF_IN_USE, CPF_UNAVAILABLE } = await import("@/shared/account");
    expect(cpfTakenMessage("ok")).toBe(CPF_IN_USE);
    expect(cpfTakenMessage("hardened")).toBe(CPF_UNAVAILABLE);
    expect(CPF_UNAVAILABLE).not.toMatch(/outra conta/);
  });
});
