/**
 * Zera a taxa de serviço de todas as tarifas (decisão do dono, 21/11/2026). Não apaga nada e não mexe na comissão.
 * Pare o servidor antes se estiver usando o banco embutido. Uso: npx tsx scripts/zero-service-fee.ts
 */
import { getDb, schema as s } from "../src/database";

async function main() {
  const db = await getDb();
  const rows = await db.update(s.tariffs).set({ serviceFeeCents: 0 }).returning({ id: s.tariffs.id });
  console.log(`Taxa de serviço zerada em ${rows.length} tarifa(s).`);
  process.exit(0);
}
main().catch((e) => { console.error(e.message); process.exit(1); });
