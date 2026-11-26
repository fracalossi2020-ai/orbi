import { eq, type SQL } from "drizzle-orm";
import { getDb } from "@/database";
import type { ZodType } from "zod";
import { ApiError, assertCan, audit, body, requireStepUp, requireUuid, route } from "@/backend/api";
import { RESOURCES, type Def } from "@/backend/admin-resources";
import { STAFF } from "@/shared/permissions";
import { pickFields, STEP_UP_RESOURCES } from "@/shared/step-up";

type P = { resource: string; id?: string[] };
const roles = { roles: STAFF };

function resolve(name: string) {
  // Object.hasOwn: "constructor", "__proto__" e afins vêm do protótipo e não são recursos.
  const def = Object.hasOwn(RESOURCES, name) ? RESOURCES[name] : undefined;
  if (!def) throw new ApiError(404, "Recurso não encontrado.");
  return def;
}
const whereId = (def: Def, id: string) => eq((def.table as unknown as { id: never }).id, (def.textId ? id : requireUuid(id)) as never) as SQL;
/** Linha atual (para a auditoria guardar o antes). */
async function current(def: Def, id: string) {
  const db = await getDb();
  const [row] = await db.select().from(def.table as never).where(whereId(def, id)).limit(1) as unknown as Record<string, unknown>[];
  return row;
}
/** Tarifas, planos, cupons, modalidades e regiões mexem em dinheiro e em onde a Orbi atua: pedem reautenticação recente. */
const sensitive = (resource: string) => STEP_UP_RESOURCES.has(resource);

export const GET = route<P>(async ({ user, params }) => {
  const def = resolve(params.resource);
  assertCan(user, def.permission, "read");
  const db = await getDb();
  const q = db.select().from(def.table as never);
  return { rows: await (def.order ? q.orderBy(def.order as SQL).limit(300) : q.limit(300)) };
}, roles);

export const POST = route<P>(async ({ req, user, session, params }) => {
  const def = resolve(params.resource);
  assertCan(user, def.permission, "write");
  if (!def.create) throw new ApiError(405, "Este recurso não aceita criação.");
  if (sensitive(params.resource)) requireStepUp(session);
  const values = await body(req, def.create as ZodType<Record<string, unknown>>);
  const db = await getDb();
  const [row] = (await db.insert(def.table as never).values(values as never).returning()) as unknown as { id: string }[];
  await audit(user.id, `${params.resource}.create`, params.resource, row.id, sensitive(params.resource) ? { after: pickFields(row as unknown as Record<string, unknown>, Object.keys(values)) } : undefined);
  return row;
}, roles);

export const PATCH = route<P>(async ({ req, user, session, params }) => {
  const def = resolve(params.resource);
  assertCan(user, def.permission, "write");
  const id = params.id?.[0];
  if (!def.update || !id) throw new ApiError(405, "Este recurso não aceita edição.");
  if (sensitive(params.resource)) requireStepUp(session);
  const values = await body(req, def.update as ZodType<Record<string, unknown>>);
  const db = await getDb();
  const before = sensitive(params.resource) ? await current(def, id) : undefined;
  const [row] = (await db.update(def.table as never).set(values as never).where(whereId(def, id)).returning()) as unknown as { id: string }[];
  if (!row) throw new ApiError(404, "Registro não encontrado.");
  const keys = Object.keys(values);
  // Antes e depois dos campos mudados (tarifa, comissão, preço, valor do cupom...).
  await audit(user.id, `${params.resource}.update`, params.resource, id, { fields: keys, ...(before ? { before: pickFields(before, keys), after: pickFields(row as unknown as Record<string, unknown>, keys) } : {}) });
  return row;
}, roles);

export const DELETE = route<P>(async ({ user, session, params }) => {
  const def = resolve(params.resource);
  assertCan(user, def.permission, "write");
  const id = params.id?.[0];
  if (!def.remove || !id) throw new ApiError(405, "Este recurso não aceita exclusão.");
  if (sensitive(params.resource)) requireStepUp(session);
  const db = await getDb();
  const before = sensitive(params.resource) ? await current(def, id) : undefined;
  try {
    await db.delete(def.table as never).where(whereId(def, id));
  } catch (e) {
    // Chave estrangeira (23503): cupom em corridas, parceiro em economias de motoristas etc. Não dá para apagar; melhor desativar.
    const code = (e as { code?: string; cause?: { code?: string } }).code ?? (e as { cause?: { code?: string } }).cause?.code;
    if (code === "23503") throw new ApiError(409, "Este registro está em uso e não pode ser apagado. Desative-o em vez de excluir.");
    throw e;
  }
  await audit(user.id, `${params.resource}.delete`, params.resource, id, before ? { before: pickFields(before, Object.keys(before).filter((k) => k !== "id")) } : undefined);
  return { ok: true };
}, roles);
