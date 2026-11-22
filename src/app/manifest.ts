import type { MetadataRoute } from "next";

/**
 * Manifesto do app: no Android, "Instalar app"; no iPhone, Compartilhar › "Adicionar à Tela de Início".
 * Abre em tela cheia, sem a barra do navegador, direto na entrada (criar conta ou entrar).
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Orbi — Sua direção, nosso compromisso.",
    short_name: "Orbi",
    description: "Mobilidade no Vale do Aço: preço antes de pedir, motorista identificado e viagem compartilhada.",
    lang: "pt-BR",
    // Abre direto na entrada: quem já tem conta cai na própria tela (o layout de entrada redireciona), quem não tem vê criar/entrar.
    start_url: "/entrar",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#02060E",
    theme_color: "#02060E",
    icons: [
      { src: "/app-icon/192", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/app-icon/512", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/app-icon/512m", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Pedir viagem", url: "/passageiro" },
      { name: "Dirigir", url: "/motorista" },
    ],
  };
}
