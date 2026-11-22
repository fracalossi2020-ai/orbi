/**
 * Primeira vez neste aparelho? A entrada (/entrar) abre em "criar conta" para quem nunca entrou aqui,
 * e no login para quem já entrou alguma vez (mesmo depois de sair da conta).
 * Fica no próprio aparelho: antes de a pessoa digitar algo, o servidor não tem como saber quem ela é.
 */
const KEY = "orbi-conta";

/** Já entrou ou criou conta neste aparelho alguma vez. */
export function isReturning(): boolean {
  try { return localStorage.getItem(KEY) === "1"; } catch { return true; } // sem armazenamento: mostra o login, que tem "Criar conta" logo abaixo
}

/** Marca o aparelho depois de entrar ou criar conta (e ao abrir o app já conectado). */
export function markReturning() {
  try { localStorage.setItem(KEY, "1"); } catch { /* sem armazenamento: nada a fazer */ }
}
