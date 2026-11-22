import { useId, type ReactNode } from "react";

/**
 * Veículos de lado, um desenho por categoria (essencial, conforto, família, moto).
 * Linguagem: elétrico moderno (frente lisa, barra de luz, vidro numa peça só, rodas grandes, traseira em curva).
 * Todos usam o mesmo quadro 360x130 e a mesma linha de chão (y = 118), então ficam alinhados lado a lado
 * numa lista. As cores vêm do contêiner (--primary, --mark). Sem texto no desenho.
 */

const TIRE = "#161B22";
const RIM = "#D5DAE0";
const HUB = "#2A313A";
const GLASS = "#0B1F3F";
const TAIL = "#E5484D";
const DARK = "#10161D";
const GROUND = 118;
const WY = 96; // centro das rodas dos carros
const WR = 22;

/** Roda: pneu escuro com fio claro, aro liso com anel claro e miolo. Fica sempre apoiada na linha de chão. */
function Wheel({ cx, cy = WY, r = WR }: { cx: number; cy?: number; r?: number }) {
  const k = r / WR;
  return (
    <g>
      <circle cx={cx} cy={cy} r={r} fill={TIRE} stroke="#fff" strokeOpacity=".3" strokeWidth="1" />
      <circle cx={cx} cy={cy} r={r * 0.66} fill={HUB} stroke={RIM} strokeWidth={2.6 * k} />
      <circle cx={cx} cy={cy} r={r * 0.2} fill={RIM} opacity=".75" />
    </g>
  );
}

/** Pontos do recorte do arco (circunferência de raio `r`) cortado na altura `y` da saia. */
function arch(cx: number, cy: number, r: number, y: number) {
  const dx = Math.sqrt(r * r - (y - cy) ** 2);
  return { l: +(cx - dx).toFixed(1), r: +(cx + dx).toFixed(1), big: y > cy ? 1 : 0 };
}

/** Cava da roda: fundo escuro que preenche o recorte do arco (folga de 3 px). `flare` marca o para-lama. */
function Well({ cx, cy = WY, r = WR + 3, y, flare }: { cx: number; cy?: number; r?: number; y: number; flare?: boolean }) {
  const a = arch(cx, cy, r, y);
  return (
    <g>
      <path d={`M${a.l} ${y}A${r} ${r} 0 ${a.big} 1 ${a.r} ${y}Z`} fill="#0B0F14" />
      {flare && (
        <path
          d={`M${a.l - 1.5} ${y}A${r + 1.5} ${r + 1.5} 0 ${a.big} 1 ${a.r + 1.5} ${y}`}
          fill="none"
          stroke={DARK}
          strokeWidth="3.4"
          strokeLinecap="round"
        />
      )}
    </g>
  );
}

function Shadow({ cx, rx }: { cx: number; rx: number }) {
  return <ellipse cx={cx} cy={GROUND} rx={rx} ry="4.5" fill="#000" opacity=".16" />;
}

/** Vidro numa peça só, com reflexo sutil. */
function Glass({ d, shine }: { d: string; shine: string }) {
  return (
    <g>
      <path d={d} fill={GLASS} />
      <path d={shine} fill="#fff" opacity=".12" />
    </g>
  );
}

/** Base do corpo na altura `y`, da frente para trás, com os recortes dos dois arcos: [cx, cy, raio]. */
function bottom(y: number, front: [number, number, number], rear: [number, number, number]) {
  const f = arch(front[0], front[1], front[2], y);
  const r = arch(rear[0], rear[1], rear[2], y);
  return `L${f.r} ${y}A${front[2]} ${front[2]} 0 ${f.big} 0 ${f.l} ${y}L${r.r} ${y}A${rear[2]} ${rear[2]} 0 ${r.big} 0 ${r.l} ${y}`;
}

type SvgProps = { className?: string; title?: string };

/**
 * Quadro comum. `body` é a silhueta: recebe degradê vertical, contorno claro sutil (ajuda no escuro),
 * sombra de baixo (saia) e linha de cintura, tudo recortado pela própria silhueta.
 * `skirt` (opcional) é a altura onde começa a faixa escura de proteção da saia (SUV).
 */
function Frame({
  className,
  title,
  body,
  belt,
  skirt,
  children,
}: SvgProps & { body: string; belt: string; skirt?: number; children: ReactNode }) {
  const raw = useId().replace(/[^a-zA-Z0-9]/g, "");
  return (
    <svg viewBox="0 0 360 130" className={className} role="img" aria-label={title}>
      <defs>
        <linearGradient id={`g${raw}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="color-mix(in srgb, var(--primary), #fff 26%)" />
          <stop offset=".55" stopColor="var(--primary)" />
          <stop offset="1" stopColor="color-mix(in srgb, var(--primary), #000 30%)" />
        </linearGradient>
        <linearGradient id={`s${raw}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#000" stopOpacity="0" />
          <stop offset="1" stopColor="#000" stopOpacity=".38" />
        </linearGradient>
        <clipPath id={`c${raw}`}>
          <path d={body} />
        </clipPath>
      </defs>
      <path d={body} fill={`url(#g${raw})`} />
      <g clipPath={`url(#c${raw})`}>
        <rect x="0" y="78" width="360" height="28" fill={`url(#s${raw})`} />
        {skirt && <rect x="0" y={skirt} width="360" height="30" fill={DARK} opacity=".9" />}
        <path d={belt} fill="none" stroke="#fff" strokeOpacity=".4" strokeWidth="1" strokeLinecap="round" />
      </g>
      <path d={body} fill="none" stroke="#fff" strokeOpacity=".28" strokeWidth=".9" strokeLinejoin="round" />
      {children}
    </svg>
  );
}

/** Essencial: hatch elétrico compacto e arredondado (estilo Dolphin): teto em cúpula, capô curto, traseira em curva. */
export function EssencialArt({ className = "", title = "Carro Essencial" }: SvgProps) {
  const body =
    "M70 102Q52 101 49 88C48 76 54 64 70 55C96 38 130 30 168 30C202 30 226 40 240 54L284 64C304 68 316 76 318 88C319 96 314 101 304 102" +
    bottom(102, [256, WY, 25], [108, WY, 25]) +
    "Z";
  return (
    <Frame className={className} title={title} body={body} belt="M62 68H300">
      <Shadow cx={184} rx={140} />
      <Well cx={108} y={102} />
      <Well cx={256} y={102} />
      <Glass
        d="M76 66C78 58 84 53 96 47C112 39 138 35 168 35C196 35 214 43 226 56L242 66Z"
        shine="M126 36H150L128 66H104Z"
      />
      <path d="M298 72C307 73 312 78 314 85" fill="none" stroke="var(--mark)" strokeWidth="3" strokeLinecap="round" />
      <path d="M53 80C52 74 54 68 58 63" fill="none" stroke={TAIL} strokeWidth="3.2" strokeLinecap="round" />
      <Wheel cx={108} />
      <Wheel cx={256} />
    </Frame>
  );
}

/** Conforto: sedã fastback longo e baixo (Model 3 / Seal). */
export function ConfortoArt({ className = "", title = "Carro Conforto" }: SvgProps) {
  const body =
    "M44 102Q26 101 22 89C21 78 28 68 40 64L68 60C102 46 140 36 188 36C226 36 246 46 264 58L318 67C338 71 347 78 348 89C348 96 344 101 334 102" +
    bottom(102, [276, WY, 25], [84, WY, 25]) +
    "Z";
  return (
    <Frame className={className} title={title} body={body} belt="M30 68H330">
      <Shadow cx={184} rx={168} />
      <Well cx={84} y={102} />
      <Well cx={276} y={102} />
      <Glass
        d="M82 65C110 50 146 41 188 41C220 41 238 49 254 60L272 67H82Z"
        shine="M146 42H172L150 66H122Z"
      />
      <path d="M328 71C338 73 344 77 346 85" fill="none" stroke="var(--mark)" strokeWidth="3" strokeLinecap="round" />
      <path d="M26 82C25 75 28 69 34 65" fill="none" stroke={TAIL} strokeWidth="3.2" strokeLinecap="round" />
      <Wheel cx={84} />
      <Wheel cx={276} />
    </Frame>
  );
}

/** Família: SUV crossover alto, teto quase reto, coluna traseira larga, saia alta com faixa de proteção e rodas maiores. */
export function FamiliaArt({ className = "", title = "Carro Família" }: SvgProps) {
  const cy = 94;
  const r = 24;
  const body =
    "M62 96Q44 95 40 84C38 72 40 60 46 48C56 30 84 16 124 11C150 8 180 8 206 9C236 10 256 28 272 46L308 55C326 58 333 66 334 80C335 90 330 96 318 96" +
    bottom(96, [270, cy, r + 3], [96, cy, r + 3]) +
    "Z";
  return (
    <Frame className={className} title={title} body={body} belt="M48 56H318" skirt={86}>
      <Shadow cx={188} rx={150} />
      <Well cx={96} cy={cy} r={r + 3} y={96} flare />
      <Well cx={270} cy={cy} r={r + 3} y={96} flare />
      <Glass
        d="M90 56L100 38C106 28 116 20 136 18L206 17C232 17 250 32 261 47L264 56Z"
        shine="M130 19H156L134 56H106Z"
      />
      <path d="M172 17V56" stroke="color-mix(in srgb, var(--primary), #000 25%)" strokeWidth="4" />
      <path d="M310 58C322 61 328 67 330 77" fill="none" stroke="var(--mark)" strokeWidth="3" strokeLinecap="round" />
      <path d="M44 80C42 70 44 60 48 52" fill="none" stroke={TAIL} strokeWidth="3.2" strokeLinecap="round" />
      <Wheel cx={96} cy={cy} r={r} />
      <Wheel cx={270} cy={cy} r={r} />
    </Frame>
  );
}

/** Moto: scooter elétrica de perfil: rabeta curta e levantada, banco pequeno, assoalho baixo, escudo largo e inclinado com farol em barra. */
export function MotoArt({ className = "", title = "Motocicleta" }: SvgProps) {
  const cy = 102;
  const r = 16;
  const ar = r + 3;
  const body =
    "M89 57C92 64 106 69 150 71C164 72 170 80 176 86C180 90 190 90 206 90C216 90 221 84 223 74L227 53C229 44 234 40 241 40C249 40 254 45 258 51L276 70C284 77 289 83 289 94" +
    bottom(94, [258, cy, ar], [112, cy, ar]) +
    "C92 90 89 80 90 70Q89 63 89 57Z";
  return (
    <Frame className={className} title={title} body={body} belt="M88 71C114 74 150 75 172 84">
      <Shadow cx={186} rx={120} />
      <Well cx={112} cy={cy} r={ar} y={94} />
      <Well cx={258} cy={cy} r={ar} y={94} />
      <path d="M106 68C108 61 114 59 122 59H134C141 59 145 63 147 71C130 72 116 71 106 68Z" fill={DARK} stroke="#fff" strokeOpacity=".22" strokeWidth=".8" />
      <path d="M259 53C263 58 268 63 273 68" fill="none" stroke="var(--mark)" strokeWidth="3.4" strokeLinecap="round" />
      <path d="M231 37Q241 31 253 35" fill="none" stroke={DARK} strokeWidth="4.5" strokeLinecap="round" />
      <path d="M89 60C89.5 64 90 67 91 70" fill="none" stroke={TAIL} strokeWidth="3" strokeLinecap="round" />
      <path d="M274 88L258 102" stroke={DARK} strokeWidth="3.5" strokeLinecap="round" />
      <Wheel cx={112} cy={cy} r={r} />
      <Wheel cx={258} cy={cy} r={r} />
    </Frame>
  );
}

/** Mantido por compatibilidade: o carro "padrão" é o Essencial. */
export function CarArt(props: SvgProps) {
  return <EssencialArt {...props} />;
}

/**
 * Desenho certo para a categoria (slug do seed: essencial, conforto, familia, moto).
 * Slug desconhecido: usa os assentos como pista (mais de 4 = SUV; 1 = moto) e, sem isso, o hatch.
 */
export function CategoryArt({ slug, seats, className = "", title }: { slug?: string; seats?: number } & SvgProps) {
  const s = (slug ?? "").toLowerCase();
  if (s === "moto" || s.includes("moto") || seats === 1) return <MotoArt className={className} title={title} />;
  if (s === "familia" || s.includes("famil") || (seats ?? 0) > 4) return <FamiliaArt className={className} title={title} />;
  if (s === "conforto" || s.includes("confort")) return <ConfortoArt className={className} title={title} />;
  return <EssencialArt className={className} title={title} />;
}
