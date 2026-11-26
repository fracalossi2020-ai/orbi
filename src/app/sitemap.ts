import type { MetadataRoute } from "next";
import { eq } from "drizzle-orm";
import { getDb, schema as s } from "@/database";
import { currentHostRole, separatedHosts } from "@/backend/host";

// Depende do host que pergunta (modo separado), então não pode ser montado uma vez só no build.
export const dynamic = "force-dynamic";

/** Mapa do site para buscadores: páginas públicas e uma página por cidade ativa. */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const cfg = separatedHosts();
  // Modo separado: o mapa do site só existe no www (app e admin não são indexados).
  if (cfg && (await currentHostRole()) !== "www") return [];
  const base = (cfg?.urls.www ?? process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
  const pages = ["", "/como-funciona", "/passageiros", "/motoristas", "/clube", "/empresa", "/ajuda", "/motoristas/requisitos", "/termos-motorista", "/parceiros", "/contato", "/privacidade", "/termos", "/status"];
  let cities: { slug: string }[] = [];
  try { cities = await (await getDb()).select({ slug: s.regions.slug }).from(s.regions).where(eq(s.regions.active, true)); } catch { /* sem banco: só as fixas */ }
  return [
    ...pages.map((p) => ({ url: `${base}${p}`, changeFrequency: "weekly" as const, priority: p === "" ? 1 : 0.7 })),
    ...cities.map((c) => ({ url: `${base}/cidades/${c.slug}`, changeFrequency: "weekly" as const, priority: 0.9 })),
  ];
}
