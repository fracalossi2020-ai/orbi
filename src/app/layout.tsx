import type { Metadata, Viewport } from "next";
import { cookies, headers } from "next/headers";
import { preconnect } from "react-dom";
import { Geist_Mono, Inter, Inter_Tight, Outfit } from "next/font/google";
import "./globals.css";
import { parseTheme, THEME_COOKIE } from "@/frontend/lib/theme";
import { asset, STATIC } from "@/frontend/lib/site-mode";
import { hostsConfig } from "@/shared/hosts";
import { SPLASH_HEAD_SCRIPT } from "@/frontend/lib/splash";

// Inter é a fonte do manual da marca (Regular, Medium, Semibold e Bold). A mono fica só para números de painel.
const inter = Inter({ display: "swap", subsets: ["latin"], variable: "--f-inter", preload: true });
// Títulos: Inter Tight, a versão compacta da própria Inter, para manchetes grandes com desenho mais firme.
const interTight = Inter_Tight({ display: "swap", subsets: ["latin"], variable: "--f-inter-tight", preload: true, weight: ["600", "700", "800"] });
const mono = Geist_Mono({ display: "swap", subsets: ["latin"], preload: false, variable: "--f-mono", weight: ["400", "500"] });
// Nome "Orbi" escrito (Wordmark, na abertura): letras arredondadas e cheias. Com preload, a fonte já chega com a página:
// a abertura dura ~2 s e aparece a cada abertura do app, justo quando a fonte ainda não está em cache.
const round = Outfit({ display: "swap", subsets: ["latin"], variable: "--f-round", preload: true, weight: ["700", "800"] });

export const metadata: Metadata = {
  // Endereço público do site: links e imagens de compartilhamento saem completos (APP_URL no .env).
  metadataBase: new URL(hostsConfig(process.env)?.urls.www || process.env.APP_URL || "http://localhost:3000"),
  title: { default: "Orbi — Sua direção, nosso compromisso.", template: "%s · Orbi" },
  description: "Uma nova forma de fazer mobilidade. Mais respeito para quem dirige. Mais confiança para quem chega.",
  icons: { icon: asset("/icon.svg"), ...(STATIC ? {} : { apple: "/app-icon/180" }) },
  openGraph: { type: "website", locale: "pt_BR", siteName: "Orbi" },
  // iPhone: aberto pela tela de início, vira app em tela cheia (sem a barra do Safari).
  appleWebApp: { capable: true, title: "Orbi", statusBarStyle: "default" },
  formatDetection: { telephone: false },
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover", themeColor: "#02060E" };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // A identidade da Orbi está definida (manual da marca): as propostas antigas não se aplicam mais.
  const identity = "a";
  // Versão vitrine (páginas prontas): sem cookies; o tema segue o do aparelho.
  const theme = STATIC ? parseTheme(undefined) : parseTheme((await cookies()).get(THEME_COOKIE)?.value);
  const fonts = [inter, interTight, mono, round].map((f) => f.variable).join(" ");
  // Abre a conexão com o servidor de mapas já no carregamento da página, antes de o mapa pedir algo.
  preconnect("https://tiles.openfreemap.org", { crossOrigin: "anonymous" });
  // Abertura do app: depois de entrar, sair ou criar conta ela não repete. O script marca isso antes da primeira pintura (nonce do proxy, por causa da CSP).
  const nonce = STATIC ? undefined : (await headers()).get("x-nonce") ?? undefined;
  return (
    <html lang="pt-BR" data-identity={identity} data-theme={theme} className={fonts} suppressHydrationWarning>
      {!STATIC && <head><script nonce={nonce} suppressHydrationWarning dangerouslySetInnerHTML={{ __html: SPLASH_HEAD_SCRIPT }} /></head>}
      <body>{children}</body>
    </html>
  );
}
