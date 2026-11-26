import Link from "next/link";
import { asset } from "@/frontend/lib/site-mode";
import { FOOD_DEMO_BANNER } from "@/shared/food/flag";
import { storePhoto } from "@/shared/food/photos";
import type { FoodStore } from "@/shared/food/types";

/** Faixa de demonstração do painel da loja (/loja), do /admin/food e da página de logos. A aba do passageiro não a mostra. Sem estado. */
export function DemoBanner({ children }: { children?: React.ReactNode }) {
  return (
    <div role="note" data-testid="food-demo-banner" className="mb-4 rounded-2xl bg-[color-mix(in_srgb,var(--warn)_13%,transparent)] px-4 py-2.5 text-sm text-warn">
      <p className="font-bold tracking-wide">{FOOD_DEMO_BANNER}</p>
      {children && <p className="mt-0.5 text-[13px] font-medium">{children}</p>}
    </div>
  );
}

/**
 * Capa da loja: foto genérica da categoria (public/food, créditos em /creditos). Decorativa (o nome da loja está ao lado).
 * `compact` é o quadradinho das listas. Enquanto a imagem carrega, o fundo tonal evita um salto de layout.
 */
export function FoodArt({ store, compact = false, className = "" }: { store: Pick<FoodStore, "id" | "category">; compact?: boolean; className?: string }) {
  return (
    <div aria-hidden="true" className={`relative shrink-0 overflow-hidden bg-tint ${className}`}>
      {/* eslint-disable-next-line @next/next/no-img-element -- arquivo local já em WebP no tamanho certo */}
      <img src={asset(storePhoto(store))} alt="" loading={compact ? "lazy" : "eager"} decoding="async" draggable={false} className="absolute inset-0 size-full object-cover" />
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
