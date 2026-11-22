/**
 * Lista as duplicatas que fariam a migração 0013 falhar ao criar índices únicos. SOMENTE LEITURA (transação READ ONLY).
 * Rode ANTES de subir a versão com a 0013 num banco que já tem dados:
 *   DATABASE_URL=postgres://... npm run db:check-duplicates
 * Sem DATABASE_URL, abre o banco embutido em .data/pg (pare o servidor antes). Não roda migrações nem seed.
 * Sai com código 1 se achar duplicatas e 2 se alguma checagem falhou (resultado incompleto). A limpeza é manual (decida qual linha manter): este script não apaga nada.
 */
import path from "node:path";

type Check = { index: string; table: string; key: string; where: string; hint: string };

// Espelha os índices únicos criados em src/database/migrations/0013_harsh_whizzer.sql.
const CHECKS: Check[] = [
  { index: "emergencies_ride_open", table: "emergencies", key: "ride_id", where: "reviewed_at is null", hint: "mais de um alerta de SOS aberto na mesma corrida" },
  { index: "ledger_ride_settle", table: "ledger", key: "ride_id, type", where: "type in ('ride_net', 'cash_due') and ride_id is not null", hint: "corrida liquidada mais de uma vez no extrato (pode distorcer saldo)" },
  { index: "offers_ride_pending", table: "offers", key: "ride_id", where: "status = 'pending'", hint: "mais de uma oferta pendente para a mesma corrida" },
  { index: "offers_driver_pending", table: "offers", key: "driver_id", where: "status = 'pending'", hint: "mais de uma oferta pendente para o mesmo motorista" },
  { index: "payments_ride", table: "payments", key: "ride_id", where: "true", hint: "mais de um pagamento para a mesma corrida" },
];

type Run = (sql: string) => Promise<Record<string, unknown>[]>;

async function open(): Promise<{ run: Run; close: () => Promise<void> }> {
  if (process.env.DATABASE_URL) {
    const { Pool } = await import("pg");
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    const client = await pool.connect();
    await client.query("BEGIN READ ONLY");
    return { run: async (q) => (await client.query(q)).rows, close: async () => { await client.query("ROLLBACK"); client.release(); await pool.end(); } };
  }
  const { PGlite } = await import("@electric-sql/pglite");
  const dir = path.join(process.env.PRUMO_DATA_DIR || path.join(process.cwd(), ".data"), "pg");
  const db = new PGlite(dir);
  await db.query("BEGIN READ ONLY");
  return { run: async (q) => (await db.query(q)).rows as Record<string, unknown>[], close: async () => { await db.query("ROLLBACK"); await db.close(); } };
}

async function main() {
  const { run, close } = await open();
  let total = 0;
  let skipped = 0;
  try {
    for (const c of CHECKS) {
      let rows: Record<string, unknown>[];
      await run("SAVEPOINT chk");
      try {
        rows = await run(`select ${c.key}, count(*)::int as n, array_agg(id::text order by created_at) as ids from ${c.table} where ${c.where} group by ${c.key} having count(*) > 1 order by n desc limit 200`);
      } catch (e) {
        console.log(`- ${c.index}: ignorado (${(e as Error).message.split("\n")[0]})`);
        continue;
      }
      if (!rows.length) { console.log(`ok   ${c.index}`); continue; }
      total += rows.length;
      console.log(`DUPL ${c.index} (${c.table}): ${rows.length} grupo(s), ${c.hint}`);
      for (const r of rows.slice(0, 20)) console.log(`       ${c.key} = ${c.key.split(", ").map((k) => String(r[k])).join(" / ")} | ${r.n} linhas | ids: ${(r.ids as string[]).join(", ")}`);
      if (rows.length > 20) console.log(`       ... e mais ${rows.length - 20} grupo(s)`);
    }
  } finally { await close(); }
  if (total) { console.log(`\n${total} grupo(s) duplicado(s). Resolva (mantenha uma linha por grupo) antes de aplicar a migração 0013.`); process.exit(1); }
  console.log("\nSem duplicatas: a migração 0013 pode ser aplicada.");
  process.exit(0);
}
main().catch((e) => { console.error(e.message); process.exit(1); });
