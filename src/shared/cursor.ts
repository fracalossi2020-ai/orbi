/**
 * Cursor de paginação: só o id da última corrida da página. A posição é resolvida no banco
 * ((created_at, id) < (select created_at, id ... where id = $id)), porque created_at tem microssegundos
 * e o Date do JS só guarda milissegundos (um cursor com data pularia itens).
 * Formato antigo "<ISO>|<id>" ainda é aceito (usa só o id); cursor só com data ou inválido vale como sem cursor.
 */
export type Cursor = { id: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function encodeCursor(id: string): string {
  return id;
}

export function parseCursor(raw: string | null | undefined): Cursor | null {
  if (!raw) return null;
  const id = (raw.includes("|") ? raw.split("|")[1] : raw).trim();
  return UUID.test(id) ? { id: id.toLowerCase() } : null;
}
