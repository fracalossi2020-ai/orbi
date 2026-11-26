/**
 * Quais ações do painel pedem reautenticação (step-up) e como o painel confere. Funções puras, testadas em tests/step-up.test.ts.
 */
import type { Role } from "./permissions";
import { STAFF } from "./permissions";

/** Ações de POST /api/admin/:ação que sempre pedem reautenticação. */
export const STEP_UP_ACTIONS = new Set(["settlements", "withdrawals", "cpf-release", "cpf-block-release", "staff", "settings"]);

/** Recursos genéricos (/api/admin/r/:recurso) com dinheiro, regras comerciais ou áreas de atuação: criar, editar e apagar pedem. */
export const STEP_UP_RESOURCES = new Set(["tariffs", "plans", "coupons", "modalities", "regions"]);

/** Mudar o status de uma conta: pede quando a ação é suspender, ou quando o alvo é da equipe. */
export const userChangeNeedsStepUp = (targetRole: Role, newStatus: "active" | "suspended") => newStatus === "suspended" || STAFF.includes(targetRole);

/**
 * Como a pessoa se reautentica: com o código do aplicativo autenticador (quem o tem ativo), ou com a senha
 * (só quando a segunda etapa não é exigida, ambiente de teste). null: não há como (segunda etapa exigida e ainda não ativa).
 */
export function stepUpMethod(hasTotp: boolean, mfaRequired: boolean): "totp" | "password" | null {
  if (hasTotp) return "totp";
  return mfaRequired ? null : "password";
}

/** Campos escolhidos de um registro, para a auditoria guardar o antes e o depois. */
export function pickFields(row: Record<string, unknown> | null | undefined, keys: string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of keys) if (row && k in row) out[k] = row[k] instanceof Date ? (row[k] as Date).toISOString() : row[k];
  return out;
}
