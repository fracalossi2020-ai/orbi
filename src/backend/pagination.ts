import type { NextRequest } from "next/server";
import { desc, sql, type SQL } from "drizzle-orm";
import { schema as s } from "@/database";
import { encodeCursor, parseCursor, type Cursor } from "@/shared/cursor";

/** Página de lista: tamanho (limit) e cursor (before = id do último item da página anterior). */
export function pageParams(req: NextRequest, def = 50, max = 200) {
  const url = new URL(req.url);
  const n = Math.floor(Number(url.searchParams.get("limit")));
  const limit = Number.isFinite(n) && n >= 1 ? Math.min(n, max) : def;
  return { limit, before: parseCursor(url.searchParams.get("before")) };
}

/** Condição "antes do cursor" na ordem (created_at desc, id desc): compara no banco, sem perder a precisão do timestamp. */
export function ridesBefore(before: Cursor | null): SQL | undefined {
  if (!before) return undefined;
  return sql`(${s.rides.createdAt}, ${s.rides.id}) < (select r.created_at, r.id from rides r where r.id = ${before.id}::uuid)`;
}

export const ridesOrder = () => [desc(s.rides.createdAt), desc(s.rides.id)] as const;

/** Cursor da próxima página, ou null quando não há mais. */
export function nextRideCursor(page: { createdAt: Date; id: string }[], hasMore: boolean): string | null {
  const last = page[page.length - 1];
  return hasMore && last ? encodeCursor(last.id) : null;
}
