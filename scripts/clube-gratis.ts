/**
 * Clube Orbi no lançamento (decisão do dono, 23/11/2026): só o nível grátis existe. Desativa o Básico, aplica os
 * valores novos de Plus e Pro e deixa os dois desligados. Idempotente; não apaga nenhuma linha (planos com
 * assinantes continuam existindo). Pare o servidor antes se estiver usando o banco embutido.
 * Uso: npx tsx scripts/clube-gratis.ts
 */
import { eq } from "drizzle-orm";
import { getDb, schema as s } from "../src/database";
import { PLAN_SPECS } from "../src/shared/plans";

async function main() {
  const db = await getDb();
  const basico = await db.update(s.plans).set({ active: false }).where(eq(s.plans.tier, "basico")).returning({ id: s.plans.id });
  console.log(`Básico desativado: ${basico.length} linha(s).`);
  for (const p of PLAN_SPECS) {
    const valores = { name: p.name, description: p.tagline, priceCents: p.priceCents, periodDays: 30, commissionBps: p.commissionBps, active: false };
    const up = await db.update(s.plans).set(valores).where(eq(s.plans.tier, p.tier)).returning({ id: s.plans.id });
    if (!up.length) await db.insert(s.plans).values({ tier: p.tier, ...valores });
    console.log(`${p.name}: ${up.length ? "atualizado" : "criado"}, ${(p.priceCents / 100).toFixed(2)} / ${p.commissionBps / 100}%, desligado.`);
  }
  const todos = await db.select({ tier: s.plans.tier, name: s.plans.name, price: s.plans.priceCents, bps: s.plans.commissionBps, active: s.plans.active }).from(s.plans);
  console.table(todos);
  process.exit(0);
}
main().catch((e) => { console.error(e.message); process.exit(1); });
