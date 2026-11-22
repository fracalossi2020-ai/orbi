import { STAFF, type Role } from "./permissions";

/**
 * Regras da conta que valem para passageiro e motorista. Toda conta nasce passageiro;
 * virar motorista é um passo dentro da conta, e o motorista continua podendo pedir corridas.
 */

export const OFFLINE_TO_REQUEST = "Fique offline para pedir uma corrida.";
export const ALREADY_DRIVER = "Sua conta já é de motorista.";
export const STAFF_CANNOT_DRIVE = "Contas da equipe não podem virar motorista.";
// O cadastro não liga o CPF ao titular: quem encontra o próprio CPF em outra conta precisa de um caminho (o suporte libera).
export const CPF_IN_USE = "Este CPF já está em outra conta. Se ele é seu e você não criou essa conta, fale com o suporte em Contato.";
/**
 * Resposta quando o teto geral de consultas de CPF foi atingido ("endurecido"): o cadastro continua funcionando para
 * todos (não vira negação de serviço), mas deixa de confirmar que aquele CPF tem conta.
 */
export const CPF_UNAVAILABLE = "Não foi possível concluir o cadastro com estes dados. Confira as informações ou fale com o suporte em Contato.";
/** ok: pode consultar; limited: este endereço passou do limite (429); hardened: teto geral atingido (resposta genérica). */
export type CpfScan = "ok" | "limited" | "hardened";
export const cpfTakenMessage = (scan: CpfScan) => (scan === "hardened" ? CPF_UNAVAILABLE : CPF_IN_USE);
export const CPF_NOT_ACCOUNT = "Use o CPF da sua conta, o mesmo do cadastro. Se ele estiver errado, fale com o suporte.";

/** Quem pode virar motorista: só passageiro. Equipe não (o painel e a operação não se misturam). */
export function becomeDriverProblem(role: Role): { status: 400 | 403; message: string } | null {
  if (STAFF.includes(role)) return { status: 403, message: STAFF_CANNOT_DRIVE };
  if (role === "driver") return { status: 400, message: ALREADY_DRIVER };
  return null;
}

/**
 * Motorista também pede corrida, mas não enquanto está trabalhando: online (pode receber oferta)
 * ou com uma corrida aberta como motorista. driver: null para quem nunca fez cadastro de motorista.
 */
export function rideRequestProblem(driver: { online: boolean; activeRide: boolean } | null): string | null {
  if (driver && (driver.online || driver.activeRide)) return OFFLINE_TO_REQUEST;
  return null;
}

/** CPF do cadastro de motorista: quando a conta já tem CPF, só vale o mesmo (só dígitos dos dois lados). */
export function onboardingCpfProblem(accountCpf: string | null | undefined, cpf: string): string | null {
  if (accountCpf && accountCpf !== cpf) return CPF_NOT_ACCOUNT;
  return null;
}

/**
 * Forma única de ler "e-mail ou telefone" digitado no login: com @ vira e-mail minúsculo e sem espaços;
 * sem @ vira só os dígitos do telefone. Serve para buscar a conta e para a chave do limite de tentativas
 * (assim "ANA@x.com", " ana@x.com" e "(31) 99999-8888" / "31999998888" contam como a mesma conta).
 */
export function normalizeIdentifier(raw: string): string {
  const t = raw.trim().toLowerCase();
  if (t.includes("@")) return t.replace(/\s+/g, "");
  return t.replace(/\D/g, "") || t;
}

/**
 * Corrida na cópia dos dados (LGPD): quem dirigiu não recebe dados do passageiro (nome, celular de quem embarcou,
 * identificador da conta e o link público de acompanhamento). Quem pediu a corrida recebe a própria corrida inteira.
 */
export function rideForExport<T extends { passengerId: string; driverId: string | null; riderName?: string | null; riderPhone?: string | null; shareToken?: string }>(ride: T, userId: string) {
  if (ride.passengerId === userId || ride.driverId !== userId) return ride;
  const { riderName: _n, riderPhone: _p, passengerId: _i, shareToken: _s, ...rest } = ride;
  return rest;
}

/** Campos da conta que nunca vão para a tela da equipe: resumo da senha, segredos da verificação em duas etapas, vínculo do Google e e-mail pendente. */
const USER_SECRETS = ["passwordHash", "totpSecret", "totpLastStep", "recoveryCodes", "googleSub", "pendingEmail"] as const;

export function staffUserView<T extends Record<string, unknown>>(user: T): Omit<T, (typeof USER_SECRETS)[number]> {
  const out: Record<string, unknown> = { ...user };
  for (const k of USER_SECRETS) delete out[k];
  return out as Omit<T, (typeof USER_SECRETS)[number]>;
}
