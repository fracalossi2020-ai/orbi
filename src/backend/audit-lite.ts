import { headers } from "next/headers";
import { getDb, schema as s } from "@/database";
import { rawClientIp } from "@/shared/client-ip";
import { maskIp } from "@/shared/sessions";

/** De onde veio o pedido atual: IP mascarado (/24 ou /64) e navegador. Fora de um pedido (motor de corridas, sweeper): vazio. */
export async function requestOrigin(): Promise<{ ip: string | null; ua: string | null }> {
  try {
    const h = await headers();
    return { ip: maskIp(rawClientIp(h)), ua: (h.get("user-agent") ?? "").slice(0, 300) || null };
  } catch { return { ip: null, ua: null }; }
}

/** Grava na auditoria sem depender de api.ts (que importa rides.ts): usado pelo motor de corridas. */
export async function audit(actorId: string | null, action: string, entity: string, entityId?: string | null, meta?: Record<string, unknown>) {
  const db = await getDb();
  const o = await requestOrigin();
  await db.insert(s.auditLog).values({ actorId, action, entity, entityId: entityId ?? null, meta, ip: o.ip, ua: o.ua });
}
