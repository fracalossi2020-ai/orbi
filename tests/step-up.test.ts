import { describe, expect, it } from "vitest";
import { enforceInviteSweep, inviteExpiry, inviteUsable, staffInviteOverdue } from "@/shared/invite";
import { INVITE_TTL_MS } from "@/shared/sessions";
import { pickFields, STEP_UP_ACTIONS, STEP_UP_RESOURCES, stepUpMethod, userChangeNeedsStepUp } from "@/shared/step-up";

describe("reautenticação para ações sensíveis (A2)", () => {
  it("lista as ações e os recursos que pedem step-up", () => {
    expect([...STEP_UP_ACTIONS].sort()).toEqual(["cpf-block-release", "cpf-release", "settings", "settlements", "staff", "withdrawals"]);
    expect([...STEP_UP_RESOURCES].sort()).toEqual(["coupons", "modalities", "plans", "regions", "tariffs"]);
  });
  it("usuário: suspender sempre pede; reativar só quando o alvo é da equipe", () => {
    expect(userChangeNeedsStepUp("passenger", "suspended")).toBe(true);
    expect(userChangeNeedsStepUp("driver", "active")).toBe(false);
    expect(userChangeNeedsStepUp("atendente", "active")).toBe(true);
    expect(userChangeNeedsStepUp("admin", "suspended")).toBe(true);
  });
  it("método: código do autenticador se ativo; senha só quando a segunda etapa não é exigida; senão impossível", () => {
    expect(stepUpMethod(true, true)).toBe("totp");
    expect(stepUpMethod(true, false)).toBe("totp");
    expect(stepUpMethod(false, false)).toBe("password");
    expect(stepUpMethod(false, true)).toBeNull();
  });
  it("pickFields guarda só os campos pedidos e datas em ISO", () => {
    expect(pickFields({ a: 1, b: 2, c: new Date("2026-01-01T00:00:00Z") }, ["a", "c", "x"])).toEqual({ a: 1, c: "2026-01-01T00:00:00.000Z" });
    expect(pickFields(null, ["a"])).toEqual({});
  });
});

describe("convite da equipe (A3)", () => {
  const now = 1_700_000_000_000;
  it("vale por 24 h e só uma vez", () => {
    expect(inviteExpiry(now).getTime() - now).toBe(INVITE_TTL_MS);
    expect(inviteUsable({ expiresAt: new Date(now + 1), usedAt: null }, now)).toBe(true);
    expect(inviteUsable({ expiresAt: new Date(now), usedAt: null }, now)).toBe(false);
    expect(inviteUsable({ expiresAt: new Date(now + 1000), usedAt: new Date(now) }, now)).toBe(false);
  });
  it("suspende só conta convidada, ativa e sem segunda etapa depois de 24 h", () => {
    const old = new Date(now - INVITE_TTL_MS - 1);
    expect(staffInviteOverdue({ invitedAt: old, totpEnabledAt: null, status: "active" }, now)).toBe(true);
    expect(staffInviteOverdue({ invitedAt: new Date(now - INVITE_TTL_MS), totpEnabledAt: null, status: "active" }, now)).toBe(false);
    expect(staffInviteOverdue({ invitedAt: old, totpEnabledAt: new Date(now), status: "active" }, now)).toBe(false);
    expect(staffInviteOverdue({ invitedAt: old, totpEnabledAt: null, status: "suspended" }, now)).toBe(false);
    // primeira conta (admin:create) não tem convite: nunca é suspensa
    expect(staffInviteOverdue({ invitedAt: null, totpEnabledAt: null, status: "active" }, now)).toBe(false);
  });
  it("o sweeper só age em produção de verdade ou com a segunda etapa exigida", () => {
    expect(enforceInviteSweep(true, false)).toBe(true);
    expect(enforceInviteSweep(false, true)).toBe(true);
    expect(enforceInviteSweep(false, false)).toBe(false);
  });
});
