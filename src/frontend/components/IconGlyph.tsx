import type { ReactNode } from "react";

/**
 * Ícones próprios do app, uma família só: contorno de 1,8 px num quadro 24, pontas arredondadas.
 * O ícone ativo usa a versão cheia (`filled`) do mesmo desenho. Visual chapado, sem degradê, brilho ou sombra:
 * o container é um squircle tonal (.glyph em globals.css), com tema claro e escuro.
 *
 * size: lado do container (o glifo ocupa metade). Com `bare` não há container e size é o próprio glifo.
 * behind: cor do fundo atrás de um glifo `bare` cheio (os recortes usam essa cor; padrão var(--surface)).
 * tone: "brand" (tonal azul), "quiet" (apagado, item inativo), "glass" (branco translúcido, para fundos azuis ou escuros).
 * Decorativo: o texto ao lado diz o que é, então fica aria-hidden.
 */
export type GlyphName =
  | "car" | "receipt" | "chat" | "user" | "users" | "home" | "work" | "clock" | "star" | "calendar" | "shield"
  | "package" | "store" | "map" | "pin" | "moto" | "sos" | "card" | "lock";
export type GlyphTone = "brand" | "quiet" | "glass";

const C = "currentColor";
const B = "var(--gl-bg)"; // cor do fundo atrás do glifo: recortes do desenho cheio e sobreposições do contorno

/** Pedaços de cada desenho: `main` (fill/contorno), `line` (traço que nunca é preenchido) e `cut` (detalhe interno). */
function shapes(filled: boolean): Record<GlyphName, ReactNode> {
  const f = filled ? C : "none";
  const cut = filled ? B : C;
  const main = { fill: f, stroke: C };
  const line = { fill: "none", stroke: C };
  const det = { fill: "none", stroke: cut };
  const wheel = { fill: filled ? C : B, stroke: filled ? B : C };
  return {
    car: (<>
      <path {...main} d="M3 12.2c0-1 .6-1.8 1.5-2.1l1.7-3.5A2 2 0 0 1 8 5.5h8a2 2 0 0 1 1.8 1.1l1.7 3.5c.9.3 1.5 1.1 1.5 2.1V16a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z" />
      <path {...det} d="M8.3 8h7.4M7.4 10.6h9.2" />
      <circle {...wheel} cx="7.6" cy="17.2" r="2.1" /><circle {...wheel} cx="16.4" cy="17.2" r="2.1" />
    </>),
    receipt: (<>
      <path {...main} d="M6 3.5h12a1 1 0 0 1 1 1V20.5l-2-1.4-2 1.4-2-1.4-2 1.4-2-1.4-2 1.4-2-1.4V4.5a1 1 0 0 1 1-1z" />
      <path {...det} d="M9 8.5h6M9 12h6M9 15.5h3" />
    </>),
    chat: (<>
      <path {...main} d="M12 4c4.4 0 8 2.9 8 6.5S16.4 17 12 17c-.8 0-1.5-.1-2.2-.3L6 19v-3.3C4.8 14.5 4 12.6 4 10.5 4 6.9 7.6 4 12 4z" />
      <path {...det} d="M8.6 10.5h.01M12 10.5h.01M15.4 10.5h.01" strokeWidth="2.4" />
    </>),
    user: (<>
      <circle {...main} cx="12" cy="8.2" r="3.7" />
      <path {...main} d="M4.8 19.5c0-3.5 3.2-5.6 7.2-5.6s7.2 2.1 7.2 5.6c0 .6-.4 1-1 1H5.8c-.6 0-1-.4-1-1z" />
    </>),
    users: (<>
      <circle {...main} cx="9" cy="8.5" r="3.1" />
      <path {...main} d="M3.2 19c0-3 2.6-4.9 5.8-4.9s5.8 1.9 5.8 4.9c0 .6-.4 1-1 1H4.2c-.6 0-1-.4-1-1z" />
      <path {...line} d="M15.4 5.6a3 3 0 0 1 0 5.8M17.2 14.4c2 .5 3.6 2 3.6 4.4 0 .6-.4 1.2-1 1.2h-1.4" />
    </>),
    home: (<>
      <path {...main} d="M12 3.8 3.5 11a.9.9 0 0 0 .6 1.6h1.4V19a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-6.4h1.4a.9.9 0 0 0 .6-1.6z" />
      <path {...det} d="M9.8 20v-4.6a.9.9 0 0 1 .9-.9h2.6a.9.9 0 0 1 .9.9V20" />
    </>),
    work: (<>
      <rect {...main} x="3.5" y="8" width="17" height="11.5" rx="2.4" />
      <path {...line} d="M9 8V6.8a1.3 1.3 0 0 1 1.3-1.3h3.4A1.3 1.3 0 0 1 15 6.8V8" />
      <path {...det} d="M3.5 13h17" />
    </>),
    clock: (<>
      <circle {...main} cx="12" cy="12" r="8.5" />
      <path {...det} d="M12 7.6V12l3 1.8" />
    </>),
    star: <path {...main} d="m12 3.9 2.4 5 5.5.7-4 3.9 1 5.5-4.9-2.6-4.9 2.6 1-5.5-4-3.9 5.5-.7z" />,
    calendar: (<>
      <rect {...main} x="4" y="5.5" width="16" height="14.5" rx="3" />
      <path {...line} d="M8.5 3.5v3.5M15.5 3.5v3.5" />
      <path {...det} d="M4 10h16M8.5 14h.01M12 14h.01M15.5 14h.01M8.5 17h.01M12 17h.01" strokeWidth="2" />
    </>),
    shield: (<>
      <path {...main} d="M12 3.2 5 5.8v5.4c0 4.4 2.9 7.8 7 9.6 4.1-1.8 7-5.2 7-9.6V5.8z" />
      <path {...det} d="m8.8 12 2.4 2.4 4-4.4" />
    </>),
    package: (<>
      <rect {...main} x="3" y="4.8" width="18" height="4" rx="1.4" />
      <rect {...main} x="4" y="9.6" width="16" height="10" rx="1.8" />
      <path {...det} d="M12 9.6v10" />
    </>),
    store: (<>
      <path {...main} d="M4.6 4.5h14.8l1.6 5a3 3 0 0 1-6 0 3 3 0 0 1-6 0 3 3 0 0 1-6 0z" />
      <path {...main} d="M5 12.6V19a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-6.4" />
      <path {...det} d="M10 20v-4a.8.8 0 0 1 .8-.8h2.4a.8.8 0 0 1 .8.8v4" />
    </>),
    map: (<>
      <path {...main} d="m3.5 6.6 5.5-2 6 2 5.5-2v13l-5.5 2-6-2-5.5 2z" />
      <path {...det} d="M9 4.6v13M15 6.6v13" />
    </>),
    pin: (<>
      <path {...main} d="M12 3.5A6.5 6.5 0 0 0 5.5 10c0 4.7 6.5 10.5 6.5 10.5s6.5-5.8 6.5-10.5A6.5 6.5 0 0 0 12 3.5z" />
      <circle {...det} cx="12" cy="10" r="2.3" fill={cut} />
    </>),
    moto: (<>
      <circle {...main} cx="6.2" cy="16.5" r="3" /><circle {...main} cx="17.8" cy="16.5" r="3" />
      <path {...line} d="M6.2 16.5 9.5 11h5.2l3.1 5.5M13.6 8h2.7l1.2 3M9.5 11 8 8.6H6" />
    </>),
    sos: (<>
      <path {...main} d="M7 17v-5a5 5 0 0 1 10 0v5z" />
      <rect {...main} x="5" y="17" width="14" height="3" rx="1.2" />
      <path {...det} d="M9.8 12.2a2.3 2.3 0 0 1 2.2-2.4" />
      <path {...line} d="M12 3.4v1.8M5 6.4l1.3 1.3M19 6.4l-1.3 1.3" />
    </>),
    card: (<>
      <rect {...main} x="3" y="6" width="18" height="12" rx="2.6" />
      <path {...det} d="M3 10.4h18M6.5 14.6H10" />
    </>),
    lock: (<>
      <rect {...main} x="5.5" y="10.5" width="13" height="9.5" rx="2.5" />
      <path {...line} d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" />
      <circle cx="12" cy="15" r="1.4" fill={cut} stroke="none" />
    </>),
  };
}

export function IconGlyph({ name, size = 40, tone = "brand", bare = false, filled = false, behind, className = "" }: {
  name: GlyphName; size?: number; tone?: GlyphTone; bare?: boolean; filled?: boolean; behind?: string; className?: string;
}) {
  const glyph = bare ? size : Math.round(size / 2);
  return (
    <span aria-hidden="true" data-tone={tone} data-bare={bare ? "" : undefined} className={`glyph ${className}`} style={{ width: size, height: size, ...(bare && behind ? { ["--gl-bg" as string]: behind } : {}) }}>
      <svg viewBox="0 0 24 24" width={glyph} height={glyph} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{shapes(filled)[name]}</svg>
    </span>
  );
}
