"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Icon } from "@/frontend/components/Icon";
import { IconGlyph, type GlyphName } from "@/frontend/components/IconGlyph";
import { AccountPage, type AccountUser } from "@/frontend/components/app/SharedPages";
import { SavedPlacesCard } from "@/frontend/components/app/SavedPlaces";
import { api } from "@/frontend/components/ui";

/** Topo da Conta: nome grande, nota e atalhos para o que mais se usa. */
function Hero({ u }: { u: AccountUser }) {
  const tiles: { href: string; label: string; img: GlyphName }[] = [
    { href: "/passageiro/ajuda", label: "Ajuda", img: "chat" },
    { href: "/passageiro/viagens", label: "Viagens", img: "receipt" },
    { href: "#seguranca", label: "Segurança", img: "lock" },
    { href: "#locais", label: "Lugares", img: "pin" },
  ];
  return (
    <section aria-label="Sua conta" className="space-y-5">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <h1 className="display text-[2rem] leading-tight break-words md:text-[2.75rem]">{u.name}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
            <span className="num inline-flex items-center gap-1 rounded-full bg-surface-2 px-2.5 py-1 font-semibold">
              <Icon name="star" size={14} weight="fill" className="text-[#F6B100]" />{u.ratingCount ? u.rating!.toFixed(2).replace(".", ",") : "Nova"}
            </span>          </div>
          <p className="mt-2 truncate text-sm text-muted">{[u.phone && `(${u.phone.slice(0, 2)}) ${u.phone.slice(2, -4)}-${u.phone.slice(-4)}`, u.email].filter(Boolean).join(" · ")}</p>
        </div>
        <IconGlyph name="user" size={76} className="shrink-0" />
      </div>
      <div className="grid grid-cols-2 gap-2.5">
        {tiles.map((t) => (
          <Link key={t.label} href={t.href} className="flex items-center gap-3 rounded-[22px] bg-surface-2 p-3.5 font-semibold transition-transform active:scale-[.98]">
            <IconGlyph name={t.img} size={36} />{t.label}
          </Link>
        ))}
      </div>
    </section>
  );
}

/** Destaque para virar motorista: leva à página "Seja motorista Orbi". Quem já é motorista não vê. */
function DriveCard() {
  const [role, setRole] = useState<string | null>(null);
  useEffect(() => { api<{ user: { role: string } | null }>("/api/me").then((r) => setRole(r.user?.role ?? null)).catch(() => {}); }, []);
  if (role === "driver") return null;
  return (
    <Link href="/passageiro/dirigir" data-testid="drive-card"
      className="flex items-center gap-4 rounded-[28px] bg-brand-solid p-5 text-white transition-transform hover:-translate-y-0.5">
      <span className="min-w-0 flex-1">
        <span className="display block text-xl">Quero dirigir com a Orbi</span>
        <span className="mt-1 block text-sm text-white/80">Ganho claro antes de aceitar e distribuição equilibrada. Use a mesma conta.</span>
        <span className="mt-3 inline-flex h-9 items-center gap-1.5 rounded-full bg-white px-3.5 text-sm font-semibold text-night">Saiba mais<Icon name="arrow" size={14} /></span>
      </span>
      <IconGlyph name="car" size={64} tone="glass" />
    </Link>
  );
}

export default function Page() {
  return <AccountPage hero={(u) => <Hero u={u} />}><DriveCard /><SavedPlacesCard /></AccountPage>;
}
