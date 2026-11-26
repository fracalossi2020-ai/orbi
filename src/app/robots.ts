import type { MetadataRoute } from "next";
import { currentHostRole, separatedHosts } from "@/backend/host";

// Depende do host que pergunta (modo separado), então não pode ser montado uma vez só no build.
export const dynamic = "force-dynamic";

/**
 * Buscadores leem o site público; aplicativos e API ficam de fora. O painel NÃO aparece aqui (listar /admin só anunciaria
 * o endereço): ele se protege sozinho com noindex, login e, se houver, a lista de IPs.
 * Modo separado: só o www se oferece (com o sitemap dele); app e admin pedem para não serem indexados.
 */
export default async function robots(): Promise<MetadataRoute.Robots> {
  const cfg = separatedHosts();
  if (cfg && (await currentHostRole()) !== "www") return { rules: { userAgent: "*", disallow: "/" } };
  const base = (cfg?.urls.www ?? process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/api/", "/passageiro", "/motorista", "/v/", "/identidade"] },
    sitemap: `${base}/sitemap.xml`,
  };
}
