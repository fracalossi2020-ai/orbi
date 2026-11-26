/**
 * Ícones próprios do topo do Food: traço de 1,8 px num quadro 24, pontas e cantos arredondados, com um preenchimento
 * tonal suave (a cor do traço a 14%) para dar corpo. A cor vem de `currentColor`. Decorativos: o botão ao redor tem o rótulo.
 */
export type FoodIconName = "coupon" | "orders" | "cart" | "filter" | "search" | "pin";

const TONE = { fill: "currentColor", fillOpacity: 0.14, stroke: "none" } as const;

export function FoodIcon({ name, size = 22, className = "" }: { name: FoodIconName; size?: number; className?: string }) {
  const g = { fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round" } as const;
  return (
    <svg aria-hidden="true" focusable="false" width={size} height={size} viewBox="0 0 24 24" className={className}>
      {name === "coupon" && (<>
        <path {...TONE} d="M4 8.2A1.7 1.7 0 0 1 5.7 6.5h12.6A1.7 1.7 0 0 1 20 8.2v1.6a2.2 2.2 0 0 0 0 4.4v1.6a1.7 1.7 0 0 1-1.7 1.7H5.7A1.7 1.7 0 0 1 4 15.8v-1.6a2.2 2.2 0 0 0 0-4.4z" />
        <path {...g} d="M4 8.2A1.7 1.7 0 0 1 5.7 6.5h12.6A1.7 1.7 0 0 1 20 8.2v1.6a2.2 2.2 0 0 0 0 4.4v1.6a1.7 1.7 0 0 1-1.7 1.7H5.7A1.7 1.7 0 0 1 4 15.8v-1.6a2.2 2.2 0 0 0 0-4.4z" />
        <path {...g} d="M9.3 14.7l5.4-5.4" /><circle {...g} cx="9.5" cy="9.6" r=".6" /><circle {...g} cx="14.5" cy="14.4" r=".6" />
      </>)}
      {name === "orders" && (<>
        <rect {...TONE} x="5" y="4" width="14" height="17" rx="3" />
        <rect {...g} x="5" y="4" width="14" height="17" rx="3" />
        <path {...g} d="M9 4V3.4a.9.9 0 0 1 .9-.9h4.2a.9.9 0 0 1 .9.9V4" /><path {...g} d="M8.8 10.2h6.4M8.8 13.4h6.4M8.8 16.6h3.4" />
      </>)}
      {name === "cart" && (<>
        <path {...TONE} d="M5.6 8.4h12.8a1 1 0 0 1 1 1.1l-.9 8.3a2 2 0 0 1-2 1.8H7.5a2 2 0 0 1-2-1.8l-.9-8.3a1 1 0 0 1 1-1.1z" />
        <path {...g} d="M5.6 8.4h12.8a1 1 0 0 1 1 1.1l-.9 8.3a2 2 0 0 1-2 1.8H7.5a2 2 0 0 1-2-1.8l-.9-8.3a1 1 0 0 1 1-1.1z" />
        <path {...g} d="M8.8 10.8V7.6a3.2 3.2 0 0 1 6.4 0v3.2" />
      </>)}
      {name === "filter" && (<>
        <path {...g} d="M4.5 8h8M17.5 8h2M4.5 16h2M11.5 16h8" />
        <circle {...TONE} cx="15" cy="8" r="2.6" /><circle {...g} cx="15" cy="8" r="2.6" />
        <circle {...TONE} cx="9" cy="16" r="2.6" /><circle {...g} cx="9" cy="16" r="2.6" />
      </>)}
      {name === "search" && (<>
        <circle {...TONE} cx="10.8" cy="10.8" r="6.3" /><circle {...g} cx="10.8" cy="10.8" r="6.3" />
        <path {...g} d="M15.6 15.6L20 20" />
      </>)}
      {name === "pin" && (<>
        <path {...TONE} d="M12 21s6.5-5.6 6.5-11A6.5 6.5 0 0 0 5.5 10c0 5.4 6.5 11 6.5 11z" />
        <path {...g} d="M12 21s6.5-5.6 6.5-11A6.5 6.5 0 0 0 5.5 10c0 5.4 6.5 11 6.5 11z" /><circle {...g} cx="12" cy="10" r="2.3" />
      </>)}
    </svg>
  );
}
