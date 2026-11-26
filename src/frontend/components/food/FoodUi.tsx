"use client";
import Link from "next/link";
import { useEffect, useRef } from "react";
import { Icon } from "@/frontend/components/Icon";
import { Wordmark } from "@/frontend/components/app/Wordmark";

/** Marca nas telas do Food: o nome "Orbi" do app (Wordmark) com a palavra "Food" em texto simples ao lado. */
export function FoodWordmark({ className = "text-xl" }: { className?: string }) {
  return (
    <span className="inline-flex items-baseline gap-1.5 text-ink" aria-label="Orbi Food">
      <Wordmark className={className} />
      <span className="text-sm font-semibold text-brand" aria-hidden="true">Food</span>
    </span>
  );
}

/** Cabeçalho das telas internas: voltar, título e a marca. Ocupa uma linha só. */
export function SubHeader({ title, back = "/passageiro/food" }: { title: string; back?: string }) {
  return (
    <header className="flex items-center gap-2">
      <Link href={back} aria-label="Voltar ao Food" className="grid size-11 shrink-0 place-items-center rounded-full bg-surface-2"><Icon name="back" size={20} /></Link>
      <h1 className="display min-w-0 flex-1 truncate text-2xl">{title}</h1>
      <FoodWordmark className="text-lg" />
    </header>
  );
}

/** Folha inferior (celular) / janela central (computador). Fecha com Esc, toque fora ou o botão. */
export function Sheet({ title, onClose, children, testId, footer }: { title: string; onClose: () => void; children: React.ReactNode; testId?: string; footer?: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    addEventListener("keydown", k);
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    return () => { removeEventListener("keydown", k); prev?.focus?.(); };
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-[60]" role="dialog" aria-modal="true" aria-label={title} data-testid={testId}>
      <button type="button" aria-label="Fechar" className="absolute inset-0 bg-black/45" onClick={onClose} tabIndex={-1} />
      <div ref={ref} tabIndex={-1} className="absolute inset-x-0 bottom-0 mx-auto flex max-h-[88svh] max-w-lg flex-col rounded-t-3xl bg-surface outline-none md:bottom-8 md:rounded-3xl">
        <div className="flex items-center gap-3 px-5 pt-5">
          <h2 className="display min-w-0 flex-1 text-xl">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Fechar" className="grid size-11 shrink-0 place-items-center rounded-full bg-surface-2"><Icon name="close" size={20} /></button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="border-t border-line px-5 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">{footer}</div>}
      </div>
    </div>
  );
}

/** Coração de favorito, 44 px de toque. Fica ao lado do link do cartão, nunca dentro dele. */
export function HeartButton({ on, onToggle, label, className = "" }: { on: boolean; onToggle: () => void; label: string; className?: string }) {
  return (
    <button type="button" aria-pressed={on} aria-label={on ? `Remover ${label} dos favoritos` : `Favoritar ${label}`} onClick={onToggle}
      className={`grid size-11 shrink-0 place-items-center rounded-full transition-colors ${on ? "text-[#E5484D]" : "text-muted"} ${className}`}>
      <Icon name="heart" size={22} weight={on ? "fill" : "regular"} />
    </button>
  );
}

/** Estrelas de 1 a 5 (nota do pedido). Cada estrela é um botão de 44 px. */
export function StarPicker({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  return (
    <div role="radiogroup" aria-label="Nota do pedido" className="flex">
      {[1, 2, 3, 4, 5].map((n) => (
        <button key={n} type="button" role="radio" aria-checked={value === n} aria-label={`${n} ${n === 1 ? "estrela" : "estrelas"}`} onClick={() => onChange(n)}
          className={`grid size-11 place-items-center ${n <= value ? "text-[#F5A524]" : "text-muted"}`}>
          <Icon name="star" size={30} weight={n <= value ? "fill" : "regular"} />
        </button>
      ))}
    </div>
  );
}

export function Stars({ value }: { value: number }) {
  return <span role="img" aria-label={`${value} de 5 estrelas`} className="inline-flex text-[#F5A524]">{[1, 2, 3, 4, 5].map((n) => <Icon key={n} name="star" size={16} weight={n <= value ? "fill" : "regular"} />)}</span>;
}
