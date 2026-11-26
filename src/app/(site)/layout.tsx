import { ViewTransition } from "react";
import { eq } from "drizzle-orm";
import { PlumbLine, SiteFooter, SiteNav } from "@/frontend/components/site/Chrome";
import { CookieNotice } from "@/frontend/components/site/Fx";
import { getDb, schema as s } from "@/database";
import { siteUser } from "@/backend/auth";
import { separatedHosts } from "@/backend/host";
import { AppOriginProvider } from "@/frontend/components/site/app-origin";

const HOME: Record<string, string> = { passenger: "/passageiro", driver: "/motorista", admin: "/admin", gestor: "/admin", atendente: "/admin" };

async function activeCities() {
  try { return await (await getDb()).select({ slug: s.regions.slug, name: s.regions.name }).from(s.regions).where(eq(s.regions.active, true)); }
  catch { return []; }
}

// Dados da empresa para o Google (resultado com nome, área atendida e endereço do site).
const ORG = {
  "@context": "https://schema.org", "@type": "Organization", name: "Orbi", slogan: "Sua direção, nosso compromisso.",
  areaServed: ["Ipatinga", "Coronel Fabriciano", "Timóteo"].map((name) => ({ "@type": "City", name })),
};

export default async function SiteLayout({ children }: { children: React.ReactNode }) {
  const [user, cities] = await Promise.all([siteUser(), activeCities()]);
  // Modo separado: os botões "Entrar", "Abrir o app" etc. apontam para o app (endereço da configuração). Um host só: relativo, como sempre.
  const appOrigin = separatedHosts()?.urls.app ?? "";
  return (
    <AppOriginProvider origin={appOrigin}>
    <div className="site-one">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ORG) }} />
      <a href="#conteudo" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[60] focus:rounded-lg focus:bg-surface focus:p-3">Ir para o conteúdo</a>
      <SiteNav account={user ? HOME[user.role] : null} />
      <PlumbLine />
      {/* Troca de página com transição suave (onde o navegador permite; nos demais, troca normal). */}
      <ViewTransition default="page-swap">
        <main id="conteudo">{children}</main>
      </ViewTransition>
      <SiteFooter cities={cities} />
      <CookieNotice />
    </div>
    </AppOriginProvider>
  );
}
