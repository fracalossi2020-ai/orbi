/** code: identificador estável para o app reagir (por exemplo, "mfa_setup" leva à tela de ativar as duas etapas). */
export class ApiError extends Error {
  constructor(public status: number, message: string, public code?: string) { super(message); }
}
