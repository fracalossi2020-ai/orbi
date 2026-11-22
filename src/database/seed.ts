import { eq, sql } from "drizzle-orm";
import type { Db } from "./index";
import * as s from "./schema";
import { DEFAULT_WEIGHTS } from "@/shared/dispatch";
import { PLAN_SPECS } from "@/shared/plans";

/**
 * Só configuração de base: cidades da primeira operação, modalidades, categorias, tarifas e planos do motorista.
 * Nenhum motorista, passageiro, corrida, pagamento ou parceiro é criado aqui.
 * As tarifas nascem com reviewedAt nulo: o painel avisa até um gestor revisar os valores.
 */
const CITIES = [
  { slug: "ipatinga", name: "Ipatinga", state: "MG", lat: -19.4683, lng: -42.5367, radiusKm: 12 },
  { slug: "coronel-fabriciano", name: "Coronel Fabriciano", state: "MG", lat: -19.5186, lng: -42.6289, radiusKm: 9 },
  { slug: "timoteo", name: "Timóteo", state: "MG", lat: -19.5811, lng: -42.6471, radiusKm: 10 },
];

const MODALITIES = [
  { id: "corrida-carro", name: "Corridas de carro", active: true, description: "Transporte individual de passageiros em carro.",
    legalNote: "", requiredDocuments: ["cnh", "crlv", "selfie"] },
  { id: "corrida-moto", name: "Corridas de motocicleta", active: false, description: "Transporte de passageiros em motocicleta.",
    legalNote: "Ativar só depois de confirmar a permissão legal em cada município.", requiredDocuments: ["cnh", "crlv", "selfie", "curso-mototaxi"] },
  { id: "motofrete", name: "Motofrete", active: false, description: "Coleta e entrega de volumes em motocicleta.",
    legalNote: "Exige conformidade com as regras de motofrete do Contran.", requiredDocuments: ["cnh", "crlv", "selfie", "curso-motofrete"] },
  { id: "entregas", name: "Entregas", active: false, description: "Entregas urbanas de pequeno porte.", legalNote: "", requiredDocuments: ["cnh", "crlv", "selfie"] },
  { id: "corporativo", name: "Transporte corporativo", active: false, description: "Corridas faturadas para empresas.", legalNote: "Depende de contrato com cada empresa.", requiredDocuments: ["cnh", "crlv", "selfie"] },
];

const CATEGORIES = [
  { slug: "essencial", name: "Essencial", description: "Carro com até 4 passageiros", seats: 4, tariff: { baseCents: 400, perKmCents: 190, perMinCents: 30, minCents: 800, serviceFeeCents: 0, commissionBps: 1500 } },
  { slug: "conforto", name: "Conforto", description: "Carro maior, mais espaço", seats: 4, tariff: { baseCents: 550, perKmCents: 240, perMinCents: 38, minCents: 1100, serviceFeeCents: 0, commissionBps: 1500 } },
  { slug: "familia", name: "Família", description: "Até 6 passageiros", seats: 6, tariff: { baseCents: 700, perKmCents: 300, perMinCents: 45, minCents: 1500, serviceFeeCents: 0, commissionBps: 1500 } },
];

/**
 * Categoria Moto (mototáxi): uma pessoa na garupa. Tarifa inicial mais baixa que a do carro, a revisar no painel.
 * A modalidade "corrida-moto" nasce desligada: só vale onde o município autoriza, e quem liga é o administrador.
 */
const MOTO = { slug: "moto", name: "Moto", description: "Uma pessoa na garupa, capacete incluso", seats: 1,
  tariff: { baseCents: 300, perKmCents: 130, perMinCents: 18, minCents: 600, serviceFeeCents: 0, commissionBps: 1500 } };

/** Cria a categoria Moto e as tarifas dela em cada cidade, também em bancos que já existiam antes dela. */
async function ensureMotoCategory(db: Db) {
  const [exists] = await db.select({ id: s.categories.id }).from(s.categories).where(eq(s.categories.slug, MOTO.slug));
  if (exists) return;
  await db.insert(s.modalities).values(MODALITIES.filter((m) => m.id === "corrida-moto")).onConflictDoNothing();
  const [cat] = await db.insert(s.categories).values({ modalityId: "corrida-moto", slug: MOTO.slug, name: MOTO.name, description: MOTO.description, seats: MOTO.seats }).returning();
  const regions = await db.select({ id: s.regions.id }).from(s.regions);
  if (regions.length) await db.insert(s.tariffs).values(regions.map((r) => ({ regionId: r.id, categoryId: cat.id, ...MOTO.tariff })));
}

/** Os três planos do Clube Orbi (Básico, Plus, Pro), também em bancos antigos. Quem já existe não é mexido. */
async function ensureDriverPlans(db: Db) {
  await db.insert(s.plans).values(PLAN_SPECS.map((p) => ({
    tier: p.tier, name: p.name, description: p.tagline, priceCents: p.priceCents, periodDays: 30, commissionBps: p.commissionBps,
  }))).onConflictDoNothing({ target: s.plans.tier });
}

/**
 * Uma vez só: separa a nota de motorista (drivers) da de passageiro (users), que antes ficavam misturadas em users.
 * Cada avaliação está guardada na própria corrida (driver_rating e passenger_rating), então o histórico é refeito exato.
 */
async function splitRatingsOnce(db: Db) {
  const [done] = await db.select().from(s.settings).where(eq(s.settings.key, "ratingsSplitV1"));
  if (done) return;
  await db.transaction(async (tx) => {
    await tx.execute(sql`update drivers d set rating_sum = x.total, rating_count = x.n
      from (select driver_id, sum(driver_rating)::int as total, count(driver_rating)::int as n from rides where driver_rating is not null and driver_id is not null group by driver_id) x
      where x.driver_id = d.user_id`);
    await tx.execute(sql`update users set rating_sum = 0, rating_count = 0`);
    await tx.execute(sql`update users u set rating_sum = x.total, rating_count = x.n
      from (select passenger_id, sum(passenger_rating)::int as total, count(passenger_rating)::int as n from rides where passenger_rating is not null group by passenger_id) x
      where x.passenger_id = u.id`);
    await tx.insert(s.settings).values({ key: "ratingsSplitV1", value: true }).onConflictDoNothing();
  });
}

export async function seedBaseConfig(db: Db) {
  await splitRatingsOnce(db);
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(s.regions);
  if (n > 0) { await ensureMotoCategory(db); await ensureDriverPlans(db); return; }

  await db.insert(s.modalities).values(MODALITIES).onConflictDoNothing();
  const regions = await db.insert(s.regions).values(CITIES).returning();
  for (const c of CATEGORIES) {
    const [cat] = await db.insert(s.categories).values({ modalityId: "corrida-carro", slug: c.slug, name: c.name, description: c.description, seats: c.seats }).returning();
    await db.insert(s.tariffs).values(regions.map((r) => ({ regionId: r.id, categoryId: cat.id, ...c.tariff })));
  }
  await ensureMotoCategory(db);
  await ensureDriverPlans(db);
  await db.insert(s.settings).values([
    { key: "identity", value: "a" },
    { key: "dispatchWeights", value: DEFAULT_WEIGHTS },
    { key: "dispatch", value: { offerTimeoutS: 20, searchTimeoutS: 180 } },
    { key: "withdrawal", value: { minCents: 2000 } },
  ]).onConflictDoNothing();
}

export async function getSetting<T>(db: Db, key: string, fallback: T): Promise<T> {
  const [row] = await db.select().from(s.settings).where(eq(s.settings.key, key));
  return row ? (row.value as T) : fallback;
}
