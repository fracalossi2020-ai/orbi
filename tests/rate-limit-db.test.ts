import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * Limite de tentativas no banco, contra um PGlite em memória (mesmo SQL que roda em produção no PostgreSQL).
 * Confere a atomicidade do INSERT ... ON CONFLICT DO UPDATE e a janela.
 */
let mod: typeof import("@/backend/rate-limit-db");
let db: Awaited<ReturnType<typeof import("@/database").getDb>>;
let schema: typeof import("@/database").schema;
let eq: typeof import("drizzle-orm").eq;

beforeAll(async () => {
  process.env.PRUMO_DB_MEMORY = "1";
  const database = await import("@/database");
  db = await database.getDb();
  schema = database.schema;
  eq = (await import("drizzle-orm")).eq;
  mod = await import("@/backend/rate-limit-db");
}, 60_000);

afterAll(() => { delete process.env.PRUMO_DB_MEMORY; });

describe("rateLimitDb", () => {
  it("conta tentativas e passa a recusar depois do limite", async () => {
    for (let i = 0; i < 3; i++) expect(await mod.rateLimitDb("t:basico", 3)).toBe(true);
    expect(await mod.rateLimitDb("t:basico", 3)).toBe(false);
    expect(await mod.rateLimitDb("t:basico", 3)).toBe(false);
    expect(await mod.isRateLimitedDb("t:basico", 3)).toBe(true);
    expect(await mod.rateCountDb("t:basico")).toBe(5);
  });
  it("chaves diferentes não se misturam e resetLimitDb zera", async () => {
    await mod.rateLimitDb("t:a", 1); await mod.rateLimitDb("t:a", 1);
    expect(await mod.isRateLimitedDb("t:a", 1)).toBe(true);
    expect(await mod.isRateLimitedDb("t:b", 1)).toBe(false);
    await mod.resetLimitDb("t:a");
    expect(await mod.isRateLimitedDb("t:a", 1)).toBe(false);
    expect(await mod.rateLimitDb("t:a", 1)).toBe(true);
  });
  it("chamadas em paralelo não perdem contagem (atômico)", async () => {
    const results = await Promise.all(Array.from({ length: 20 }, () => mod.rateLimitDb("t:paralelo", 5)));
    expect(results.filter(Boolean)).toHaveLength(5);
    expect(await mod.rateCountDb("t:paralelo")).toBe(20);
  });
  it("janela vencida recomeça a contagem; blocked_until fica preenchido só enquanto passou do limite", async () => {
    await mod.rateLimitDb("t:janela", 1, 15 * 60_000);
    await mod.rateLimitDb("t:janela", 1, 15 * 60_000);
    const [over] = await db.select().from(schema.rateLimits).where(eq(schema.rateLimits.key, "t:janela"));
    expect(over.n).toBe(2);
    expect(over.blockedUntil).not.toBeNull();
    // envelhece a janela: a próxima tentativa começa de novo
    await db.update(schema.rateLimits).set({ windowStart: new Date(Date.now() - 20 * 60_000) }).where(eq(schema.rateLimits.key, "t:janela"));
    expect(await mod.rateLimitDb("t:janela", 1, 15 * 60_000)).toBe(true);
    const [fresh] = await db.select().from(schema.rateLimits).where(eq(schema.rateLimits.key, "t:janela"));
    expect(fresh.n).toBe(1);
    expect(fresh.blockedUntil).toBeNull();
  });
  it("a faxina apaga só as chaves antigas", async () => {
    await mod.rateLimitDb("t:velha", 5);
    await mod.rateLimitDb("t:nova", 5);
    await db.update(schema.rateLimits).set({ windowStart: new Date(Date.now() - 30 * 60 * 60_000) }).where(eq(schema.rateLimits.key, "t:velha"));
    expect(await mod.cleanupRateLimits()).toBeGreaterThanOrEqual(1);
    expect(await db.select().from(schema.rateLimits).where(eq(schema.rateLimits.key, "t:velha"))).toHaveLength(0);
    expect(await db.select().from(schema.rateLimits).where(eq(schema.rateLimits.key, "t:nova"))).toHaveLength(1);
  });
});
