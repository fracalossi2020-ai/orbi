/** Normaliza um caminho: sem query, sem #, sem barra final (a raiz "/" fica como está). */
export function cleanPath(p: string): string {
  const base = p.split(/[?#]/)[0] || "/";
  return base.length > 1 ? base.replace(/\/+$/, "") || "/" : base;
}

/**
 * Para onde a seta de voltar leva: sempre um pai fixo da rota, nunca o histórico cego.
 * - na raiz do app: null (sem seta);
 * - exceção explícita no mapa: usa ela;
 * - senão, o item do menu mais longo que seja pai do caminho (e diferente dele);
 * - senão, a raiz.
 */
export function backTarget(path: string, root: string, navHrefs: string[], exceptions: Record<string, string> = {}): string | null {
  const p = cleanPath(path);
  const r = cleanPath(root);
  if (p === r) return null;
  const ex = Object.entries(exceptions).find(([k]) => cleanPath(k) === p);
  if (ex) return cleanPath(ex[1]);
  let best: string | null = null;
  for (const h of navHrefs.map(cleanPath)) {
    if (h !== p && p.startsWith(h + "/") && (!best || h.length > best.length)) best = h;
  }
  return best ?? r;
}
