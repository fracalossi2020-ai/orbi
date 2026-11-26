/**
 * Bloqueio de conta por tentativas erradas de senha (regras puras, sem I/O; testadas em tests/lockout.test.ts).
 * O contador fica na conta (users.failed_logins) e é zerado no login certo e na troca de senha por "Esqueci a senha".
 */

/** Sem nova falha por tanto tempo, a contagem recomeça: erros de meses atrás não somam para o bloqueio de hoje. */
export const FAIL_DECAY_MS = 24 * 60 * 60_000;

/**
 * Atraso (segundos) da resposta de uma senha errada: nada até a 2ª falha, depois min(2^(n-3), 16) a partir da 3ª.
 * n é o número de falhas já contando a atual.
 */
export function progressiveDelayS(n: number): number {
  if (!Number.isFinite(n) || n < 3) return 0;
  return Math.min(2 ** (n - 3), 16);
}

/** Atraso em milissegundos, com um fator (0 desliga: só os testes automatizados usam, nunca produção). */
export const progressiveDelayMs = (n: number, scale = 1) => Math.round(progressiveDelayS(n) * 1000 * scale);

/**
 * Duração do bloqueio quando a falha de número n acontece: 15 min na 10ª, 1 h na 20ª, 24 h na 30ª
 * (e em cada múltiplo de 10 depois dela). Entre esses números não há bloqueio novo. null: nenhum bloqueio agora.
 */
export function lockDurationMs(n: number): number | null {
  if (!Number.isInteger(n) || n < 10 || n % 10 !== 0) return null;
  if (n === 10) return 15 * 60_000;
  if (n === 20) return 60 * 60_000;
  return 24 * 60 * 60_000;
}

/** A conta está bloqueada neste instante? */
export const isLocked = (lockedUntil: Date | null | undefined, now = Date.now()) => !!lockedUntil && lockedUntil.getTime() > now;

/** Quantas "janelas estouradas" seguidas da segunda etapa derrubam a sessão pendente. */
export const MFA_OVERFLOW_LIMIT = 3;

/** Mais que isto de falhas de login em 15 min (no servidor todo) liga o atraso geral e avisa a equipe. */
export const LOGIN_FLOOD_MAX = 300;
export const LOGIN_FLOOD_DELAY_MS = 2000;
