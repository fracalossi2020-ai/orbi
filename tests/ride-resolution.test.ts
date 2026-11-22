import { describe, expect, it } from "vitest";
import { farCompletionReasonProblem, isStuck, scaleFareToTotal, staffChargeProblem, stuckAfterS, tripFraction } from "@/shared/ride-resolution";
import { sosProblem } from "@/shared/emergency";
import { STAFF_CANCEL_FROM, STAFF_CLOSE_FROM, canTransition } from "@/shared/transitions";
import { can } from "@/shared/permissions";
import { CPF_BLOCK_DAYS, cpfBlockUntil, deletionProblem, hasDriverHistory, shouldBlockCpf } from "@/shared/account-deletion";

const fare = { grossCents: 2000, serviceFeeCents: 200, discountCents: 100, totalCents: 2100, commissionBps: 2000 };

describe("corrida presa: valores", () => {
  it("escala para o total informado e fecha no centavo", () => {
    const r = scaleFareToTotal(fare, 1050);
    expect(r.totalCents).toBe(1050);
    expect(r.grossCents + r.serviceFeeCents - r.discountCents).toBe(1050);
    expect(r.commissionCents + r.driverNetCents).toBe(r.grossCents);
  });
  it("mesmo total não muda nada", () => {
    expect(scaleFareToTotal(fare, 2100)).toMatchObject({ grossCents: 2000, serviceFeeCents: 200, discountCents: 100, commissionCents: 400, driverNetCents: 1600 });
  });
  it("valor informado: entre 1 centavo e 3x o estimado", () => {
    expect(staffChargeProblem(0, 2100)).toBeTruthy();
    expect(staffChargeProblem(6301, 2100)).toBeTruthy();
    expect(staffChargeProblem(6300, 2100)).toBeNull();
    expect(staffChargeProblem(10.5, 2100)).toBeTruthy();
  });
  it("fração do trecho fica entre o mínimo e 1", () => {
    const o = { lat: -19.47, lng: -42.54 }, d = { lat: -19.5, lng: -42.54 };
    expect(tripFraction(o, d, o)).toBeCloseTo(0.3);
    expect(tripFraction(o, d, { lat: -19.485, lng: -42.54 })).toBeGreaterThan(0.45);
    // Chegou (ou quase) ao destino: cobra tudo.
    expect(tripFraction(o, d, { lat: -19.4999, lng: -42.54 })).toBeGreaterThan(0.99);
    expect(tripFraction(o, d, d)).toBe(1);
  });
  it("lado oposto da partida não é cobrado como trecho feito", () => {
    const o = { lat: -19.47, lng: -42.54 }, d = { lat: -19.5, lng: -42.54 };
    // Mesma distância da partida que o destino (3,3 km), só que no sentido contrário: antes dava 100%.
    expect(tripFraction(o, d, { lat: -19.44, lng: -42.54 })).toBe(0.3);
    // Muito além do destino ou muito longe de lado: só o mínimo.
    expect(tripFraction(o, d, { lat: -19.6, lng: -42.54 })).toBe(0.3);
    expect(tripFraction(o, d, { lat: -19.485, lng: -42.2 })).toBe(0.3);
  });
  it("destino igual à origem cobra tudo", () => {
    const o = { lat: -19.47, lng: -42.54 };
    expect(tripFraction(o, o, { lat: -19.4, lng: -42.5 })).toBe(1);
  });
  it("motivo de encerrar longe é obrigatório", () => {
    expect(farCompletionReasonProblem("")).toBeTruthy();
    expect(farCompletionReasonProblem("  oi ")).toBeTruthy();
    expect(farCompletionReasonProblem("passageiro desceu antes")).toBeNull();
  });
});

describe("corrida presa: revisão e permissões", () => {
  it("limite: 3x a duração, mínimo de 60 min", () => {
    expect(stuckAfterS(600)).toBe(3600);
    expect(stuckAfterS(2400)).toBe(7200);
    const start = new Date("2026-01-01T10:00:00Z");
    expect(isStuck(start, 600, new Date("2026-01-01T10:59:00Z"))).toBe(false);
    expect(isStuck(start, 600, new Date("2026-01-01T11:01:00Z"))).toBe(true);
    expect(isStuck(null, 600)).toBe(false);
  });
  it("equipe encerra só em viagem e cancela qualquer corrida aberta; usuário continua sem cancelar em viagem", () => {
    expect(STAFF_CLOSE_FROM).toEqual(["in_progress"]);
    expect(STAFF_CANCEL_FROM).toContain("in_progress");
    expect(STAFF_CANCEL_FROM).not.toContain("completed");
    expect(canTransition("in_progress", "cancelled")).toBe(false);
  });
  it("só admin e gestor resolvem corrida; atendente só lê", () => {
    expect(can("admin", "rides", "write")).toBe(true);
    expect(can("gestor", "rides", "write")).toBe(true);
    expect(can("atendente", "rides", "write")).toBe(false);
  });
});

describe("SOS: quando vale", () => {
  const now = new Date("2026-01-01T12:00:00Z");
  it("em corrida ativa vale", () => {
    for (const s of ["accepted", "arrived", "in_progress"] as const) expect(sosProblem(s, null, now)).toBeNull();
  });
  it("concluída vale por 30 min", () => {
    expect(sosProblem("completed", new Date("2026-01-01T11:35:00Z"), now)).toBeNull();
    expect(sosProblem("completed", new Date("2026-01-01T11:29:00Z"), now)).toBeTruthy();
    expect(sosProblem("completed", null, now)).toBeTruthy();
  });
  it("fora disso não vale", () => {
    for (const s of ["scheduled", "searching", "cancelled", "no_driver"] as const) expect(sosProblem(s, null, now)).toBeTruthy();
  });
});

describe("exclusão de conta", () => {
  it("saldo diferente de zero ou saque aberto bloqueia", () => {
    expect(deletionProblem({ balanceCents: 0, openWithdrawals: 0 })).toBeNull();
    expect(deletionProblem({ balanceCents: 500, openWithdrawals: 0 })).toContain("Acerte seu saldo");
    expect(deletionProblem({ balanceCents: -500, openWithdrawals: 0 })).toContain("Acerte seu saldo");
    expect(deletionProblem({ balanceCents: 0, openWithdrawals: 1 })).toContain("Acerte seu saldo");
  });
  it("CPF só fica bloqueado para quem foi motorista com histórico, por 180 dias", () => {
    expect(shouldBlockCpf({ wasDriver: true, hasHistory: true })).toBe(true);
    expect(shouldBlockCpf({ wasDriver: false, hasHistory: true })).toBe(false);
    expect(shouldBlockCpf({ wasDriver: true, hasHistory: false })).toBe(false);
  });
  it("histórico é só o de motorista: corrida como passageiro não conta", () => {
    expect(hasDriverHistory({ ridesAsDriver: 0, ledgerRows: 0 })).toBe(false);
    expect(hasDriverHistory({ ridesAsDriver: 1, ledgerRows: 0 })).toBe(true);
    expect(hasDriverHistory({ ridesAsDriver: 0, ledgerRows: 2 })).toBe(true);
  });
  it("Pix pendente no provedor bloqueia a exclusão", () => {
    expect(deletionProblem({ balanceCents: 0, openWithdrawals: 0, pendingPixPayments: 1 })).toContain("Pix");
    expect(deletionProblem({ balanceCents: 0, openWithdrawals: 0, pendingPixPayments: 0 })).toBeNull();
  });
  it("180 dias", () => {
    const d = new Date("2026-01-01T00:00:00Z");
    expect((cpfBlockUntil(d).getTime() - d.getTime()) / 86400_000).toBe(CPF_BLOCK_DAYS);
  });
});
