/**
 * Marcadores do mapa (GPS, partida, destino, paradas e prévia). O mapa é sempre claro, então as cores
 * vêm das variáveis --mk-* declaradas em `.maplibregl-map` (globals.css), que não mudam com o tema do app.
 * Partida = gota redonda; destino = gota quadrada; parada = quadrado branco numerado; GPS = ponto com halo.
 * O nome do arquivo ficou do símbolo antigo.
 */
export type MarkKind = "me" | "origin" | "dest" | "stop" | "preview";

/** Corpo do marcador (dentro do `.prumo-mk`, que o MapLibre posiciona). Só os filhos animam. */
export function pinHtml(kind: MarkKind, stopNumber?: number) {
  if (kind === "me") {
    return `<span class="prumo-mk__drop"><span class="prumo-mk__halo"></span><span class="prumo-mk__pulse"></span><span class="prumo-mk__dot"></span></span>`;
  }
  if (kind === "stop") {
    return `<span class="prumo-mk__drop"><span class="prumo-mk__stem"></span><span class="prumo-mk__head"><b>${stopNumber ?? ""}</b></span></span>`;
  }
  // origin, dest e preview (a prévia é uma partida translúcida)
  return `<span class="prumo-mk__drop"><span class="prumo-mk__base"></span><span class="prumo-mk__stem"></span><span class="prumo-mk__head"><i></i></span></span>`;
}

/** Carro visto de cima (frente para cima). Os degradês usam ids fixos: todas as cópias são idênticas. */
export function carSvg(width: number, height: number) {
  return `<svg width="${width}" height="${height}" viewBox="0 0 16 28" aria-hidden="true" focusable="false">
    <defs><linearGradient id="mk-car-g" x1="0" x2="1" y1="0" y2="0">
      <stop offset="0" style="stop-color:color-mix(in srgb, var(--mk-end) 60%, #fff)"/>
      <stop offset=".5" style="stop-color:var(--mk-end)"/>
      <stop offset="1" style="stop-color:color-mix(in srgb, var(--mk-end) 62%, #000)"/>
    </linearGradient></defs>
    <path d="M8 1C11.4 1 13.2 2.8 13.7 6L14.9 20C15.1 24.4 12.4 27 8 27S.9 24.4 1.1 20L2.3 6C2.8 2.8 4.6 1 8 1Z" fill="url(#mk-car-g)" stroke="#fff" stroke-width="1.1" stroke-linejoin="round"/>
    <path d="M4.2 8.8C6.3 7.5 9.7 7.5 11.8 8.8L12.3 16.4 11.4 21.2C9.4 22.2 6.6 22.2 4.6 21.2L3.7 16.4Z" fill="var(--mk-glass)" opacity=".94"/>
    <path d="M5.2 9.6C6.6 9 8 9 9 9.3L6.4 20.4C5.8 20.3 5.3 20.1 5 19.9L4.6 16.4Z" fill="#fff" opacity=".12"/>
    <path d="M4.4 3.6Q8 2.2 11.6 3.6" fill="none" stroke="var(--mk-light)" stroke-width="1.1" stroke-linecap="round"/>
    <path d="M4.8 24.6Q8 25.6 11.2 24.6" fill="none" stroke="var(--mk-tail)" stroke-width="1.1" stroke-linecap="round"/>
  </svg>`;
}
