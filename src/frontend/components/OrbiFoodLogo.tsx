import { OrbiAccent, ORBI_SYMBOL_PATH } from "./OrbiMark";

/*
 * Logo do Orbi Food (demonstração). Parte do Logo e do símbolo da Orbi: mesmo degradê ciano → azul, "orbí" com o acento inclinado,
 * Inter bold. O que muda é só o detalhe de identidade, e a cor do "food" é o Electric Blue #1166FF (nenhuma cor nova).
 *
 *   a) símbolo com 3 linhas de vapor saindo da órbita + "orbí" + "food" em azul;
 *   b) símbolo comum + "orbí" + pílula azul "food".
 *
 * Como no Logo, o símbolo é uma máscara CSS pintada com o degradê (sem id de <linearGradient>, que se perde quando há vários na página).
 * O vapor entra na mesma máscara: traços grossos com ponta redonda, que continuam legíveis em 24 px.
 */
const GRADIENT = "linear-gradient(140deg, #00E1FF 6%, #0B6BFF 42%, #0A3BFF 62%, #00E1FF 100%)";
const FOOD_BLUE = "#1166FF";

const STEAM = ["M486 196C440 150 532 104 486 52", "M690 196C644 140 736 96 690 18", "M894 224C848 176 940 132 894 76"];
const svgMask = (inner: string, viewBox: string) =>
  `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}">${inner}</svg>`)}") center / contain no-repeat`;

const PLAIN_VIEW = "140 220 960 840";
const STEAM_VIEW = "140 -30 960 1090";
const PLAIN_MASK = svgMask(`<path d="${ORBI_SYMBOL_PATH}"/>`, PLAIN_VIEW);
const STEAM_MASK = svgMask(
  `<path d="${ORBI_SYMBOL_PATH}"/>${STEAM.map((d) => `<path d="${d}" fill="none" stroke="#000" stroke-width="60" stroke-linecap="round"/>`).join("")}`,
  STEAM_VIEW,
);

/** Símbolo da Orbi com 3 linhas de vapor saindo da órbita. `size` é a largura (a mesma do OrbiSymbol). */
export function OrbiSteamSymbol({ size = 32, className = "" }: { size?: number; className?: string }) {
  return (
    <span aria-hidden="true" className={`inline-block shrink-0 ${className}`}
      style={{ width: size, height: size * (1090 / 960), background: GRADIENT, WebkitMask: STEAM_MASK, mask: STEAM_MASK }} />
  );
}

function PlainSymbol({ size }: { size: number }) {
  return <span aria-hidden="true" className="inline-block shrink-0" style={{ width: size, height: size * 0.875, background: GRADIENT, WebkitMask: PLAIN_MASK, mask: PLAIN_MASK }} />;
}

function Wordmark({ size }: { size: number }) {
  return (
    <span aria-hidden="true" className="relative inline-flex items-baseline font-bold" style={{ fontFamily: "var(--f-inter), system-ui, sans-serif", fontSize: size, lineHeight: 1, letterSpacing: "-0.045em" }}>
      orb<span className="relative">ı
        <OrbiAccent className="absolute text-[#1166FF]" style={{ width: "0.42em", left: "0.02em", top: "-0.2em" }} />
      </span>
    </span>
  );
}

export type OrbiFoodVariant = "a" | "b";

/**
 * `size` é o tamanho do texto (como no Logo). `onDark`: no fundo escuro o "food" da variante (a) usa o azul claro do tema
 * (--mark, já na paleta) para manter o contraste; a pílula da (b) já funciona nos dois fundos.
 */
export function OrbiFoodLogo({ variant = "a", size = 26, onDark = false, symbolOnly = false, className = "" }: {
  variant?: OrbiFoodVariant; size?: number; onDark?: boolean; symbolOnly?: boolean; className?: string;
}) {
  const symbolW = size * 1.25;
  return (
    <span className={`inline-flex items-center ${className}`} style={{ fontSize: size, gap: size * 0.22 }} aria-label="Orbi Food" role="img">
      {variant === "a" ? <OrbiSteamSymbol size={symbolW} /> : <PlainSymbol size={symbolW} />}
      {!symbolOnly && <Wordmark size={size} />}
      {!symbolOnly && variant === "a" && (
        <span aria-hidden="true" className="font-semibold" style={{ fontFamily: "var(--f-inter), system-ui, sans-serif", fontSize: size, lineHeight: 1, letterSpacing: "-0.04em", marginLeft: size * -0.02, color: onDark ? "#5CC8FF" : FOOD_BLUE }}>food</span>
      )}
      {!symbolOnly && variant === "b" && (
        <span aria-hidden="true" className="inline-flex items-center rounded-full font-bold text-white" style={{ background: FOOD_BLUE, fontFamily: "var(--f-inter), system-ui, sans-serif", fontSize: size * 0.62, lineHeight: 1, letterSpacing: "-0.02em", padding: `${size * 0.2}px ${size * 0.4}px ${size * 0.22}px`, marginLeft: size * -0.04 }}>food</span>
      )}
    </span>
  );
}
