/**
 * Fila por chave: duas chamadas com a mesma chave rodam uma depois da outra (chaves diferentes não esperam).
 * Vale dentro de um processo só (mesma limitação do bus.ts); com várias instâncias, a trava de verdade precisa vir do banco.
 */
const tails = new Map<string, Promise<unknown>>();

export function withKeyLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const prev = tails.get(key) ?? Promise.resolve();
  const run = prev.then(fn, fn);
  const tail = run.catch(() => undefined);
  tails.set(key, tail);
  // Sem ninguém esperando depois, a chave sai do mapa (não vaza memória).
  void tail.then(() => { if (tails.get(key) === tail) tails.delete(key); });
  return run;
}
