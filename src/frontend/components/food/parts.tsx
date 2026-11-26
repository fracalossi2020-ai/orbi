import Link from "next/link";
import { IconGlyph, type GlyphName } from "@/frontend/components/IconGlyph";
import { FOOD_DEMO_BANNER } from "@/shared/food/flag";
import type { FoodCategoryId, FoodStore } from "@/shared/food/types";

/** Faixa que aparece em TODAS as telas do Food. Não é servidor nem cliente: sem estado. */
export function DemoBanner({ children }: { children?: React.ReactNode }) {
  return (
    <div role="note" data-testid="food-demo-banner" className="mb-4 rounded-2xl bg-[color-mix(in_srgb,var(--warn)_13%,transparent)] px-4 py-2.5 text-sm text-warn">
      <p className="font-bold tracking-wide">{FOOD_DEMO_BANNER}</p>
      {children && <p className="mt-0.5 text-[13px] font-medium">{children}</p>}
    </div>
  );
}

export const CATEGORY_GLYPH: Record<FoodCategoryId, GlyphName> = {
  pizza: "pizza", lanches: "burger", marmita: "bowl", acai: "cup", japones: "sushi", padaria: "bread", espetinho: "skewer",
};

/**
 * Capa ilustrada da loja, sem foto: blocos de cor da paleta da Orbi (azul tonal, noturno, elétrico, degradê)
 * com círculos suaves e o ícone de traço da categoria. `compact` é o quadradinho da lista.
 */
export function FoodArt({ store, compact = false, className = "" }: { store: Pick<FoodStore, "tone" | "category">; compact?: boolean; className?: string }) {
  const T = [
    { bg: "var(--tint)", dot: "color-mix(in srgb, var(--primary) 16%, transparent)", tone: "brand" as const },
    { bg: "var(--accent)", dot: "rgb(0 225 255 / .2)", tone: "glass" as const },
    { bg: "var(--primary)", dot: "rgb(255 255 255 / .16)", tone: "glass" as const },
    { bg: "var(--grad)", dot: "rgb(255 255 255 / .18)", tone: "glass" as const },
  ][store.tone];
  const g = CATEGORY_GLYPH[store.category];
  return (
    <div aria-hidden="true" className={`relative grid shrink-0 place-items-center overflow-hidden ${className}`} style={{ background: T.bg }}>
      <span className="absolute rounded-full" style={{ background: T.dot, width: compact ? "70%" : "34%", aspectRatio: "1", left: compact ? "-18%" : "-6%", top: compact ? "-22%" : "-30%" }} />
      <span className="absolute rounded-full" style={{ background: T.dot, width: compact ? "46%" : "22%", aspectRatio: "1", right: compact ? "-10%" : "8%", bottom: compact ? "-12%" : "-22%" }} />
      <IconGlyph name={g} size={compact ? 34 : 64} bare tone={T.tone} />
    </div>
  );
}

/**
 * Barra de ação fixa. No celular fica logo ACIMA da barra de baixo do app (--nav-h, definida no AppShell), nunca por cima dela;
 * no computador a barra de baixo não existe e ela encosta na borda. O conteúdo da tela reserva espaço com `pb-24`.
 */
export function BottomBar({ children }: { children: React.ReactNode }) {
  return (
    <div className="fixed inset-x-0 bottom-[var(--nav-h,0px)] z-30 border-t border-line bg-surface px-4 py-3 md:bottom-0">
      <div className="mx-auto max-w-4xl">{children}</div>
    </div>
  );
}

export function BackLink({ href, children }: { href: string; children: React.ReactNode }) {
  return <Link href={href} className="inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-brand">{children}</Link>;
}

/** Botão de quantidade, 44 px. */
export function Stepper({ qty, onChange, min = 1, label }: { qty: number; onChange: (n: number) => void; min?: number; label: string }) {
  const b = "grid size-11 place-items-center rounded-full bg-surface-2 text-lg font-bold disabled:opacity-40";
  return (
    <div className="inline-flex items-center gap-1" role="group" aria-label={label}>
      <button type="button" className={b} aria-label="Diminuir" onClick={() => onChange(qty - 1)} disabled={qty <= min}>−</button>
      <span className="w-8 text-center font-semibold tabular-nums" aria-live="polite">{qty}</span>
      <button type="button" className={b} aria-label="Aumentar" onClick={() => onChange(qty + 1)} disabled={qty >= 20}>+</button>
    </div>
  );
}
