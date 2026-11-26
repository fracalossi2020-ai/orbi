import { requireFoodDemo } from "@/backend/food";
import { OrbiFoodLogo } from "@/frontend/components/OrbiFoodLogo";
import { DemoBanner } from "@/frontend/components/food/parts";

export const metadata = { title: "Logo Orbi Food", robots: { index: false, follow: false } };

const SIZES = [24, 40, 56];

function Board({ variant, dark }: { variant: "a" | "b"; dark: boolean }) {
  const quiet = dark ? "text-[#9AA8BD]" : "text-[#536071]";
  return (
    <div className={`space-y-5 rounded-3xl p-6 ${dark ? "bg-[#02060E] text-[#F5F7FA]" : "bg-white text-[#02060E] ring-1 ring-black/10"}`}>
      <p className={`text-xs font-semibold ${quiet}`}>Fundo {dark ? "escuro" : "claro"}</p>
      {SIZES.map((s) => (
        <div key={s} className="flex items-center gap-4"><span className={`w-12 text-xs ${quiet}`}>{s} px</span><OrbiFoodLogo variant={variant} size={s} onDark={dark} /></div>
      ))}
      <div className="flex items-center gap-4"><span className={`w-12 text-xs ${quiet}`}>Símbolo</span><OrbiFoodLogo variant={variant} size={40} symbolOnly /></div>
    </div>
  );
}

/** Página interna para o dono escolher a variante do logo do Orbi Food. Só existe com o interruptor ligado. */
export default async function Page() {
  await requireFoodDemo();
  return (
    <main className="mx-auto max-w-4xl space-y-8 bg-bg p-4 py-8 md:p-8">
      <DemoBanner>Página interna para escolher o logo.</DemoBanner>
      <div>
        <h1 className="display text-3xl">Logo do Orbi Food</h1>
        <p className="mt-2 max-w-2xl text-muted">Duas variantes, nos fundos claro e escuro e em três tamanhos (24, 40 e 56 px). A variante A é a usada hoje no cabeçalho do Food e no painel da loja.</p>
      </div>
      {(["a", "b"] as const).map((v) => (
        <section key={v} aria-labelledby={`v-${v}`} className="space-y-3">
          <h2 id={`v-${v}`} className="text-xl font-bold">{v === "a" ? "A · Símbolo com vapor + food" : "B · Símbolo + etiqueta food"}</h2>
          <p className="text-sm text-muted">{v === "a" ? "A órbita ganha três linhas de vapor, e “food” vem ao lado em Electric Blue." : "O símbolo e o nome da Orbi como são, mais uma pílula azul “food”."}</p>
          <div className="grid gap-4 md:grid-cols-2"><Board variant={v} dark={false} /><Board variant={v} dark /></div>
        </section>
      ))}
    </main>
  );
}
