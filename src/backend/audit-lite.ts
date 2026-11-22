import { getDb, schema as s } from "@/database";

/** Grava na auditoria sem depender de api.ts (que importa rides.ts): usado pelo motor de corridas. */
export async function audit(actorId: string | null, action: string, entity: string, entityId?: string | null, meta?: Record<string, unknown>) {
  const db = await getDb();
  await db.insert(s.auditLog).values({ actorId, action, entity, entityId: entityId ?? null, meta });
}
