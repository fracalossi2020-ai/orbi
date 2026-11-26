import { requireFoodDemo } from "@/backend/food";
import { requireRole } from "@/backend/guard";
import { DemoBanner } from "@/frontend/components/food/parts";

export const metadata = { title: "Painel da loja · Orbi Food", robots: { index: false, follow: false } };

/** Painel da loja do Orbi Food (demonstração), no host do app. Na demo, qualquer pessoa logada abre: não é um acesso de loja de verdade. */
export default async function Layout({ children }: { children: React.ReactNode }) {
  await requireFoodDemo();
  await requireRole(["passenger", "driver", "admin", "gestor", "atendente"]);
  return (
    <div className="min-h-svh bg-bg">
      <main className="mx-auto w-full max-w-2xl p-4 pb-12">
        <DemoBanner>Na demonstração, qualquer pessoa logada abre este painel. Os pedidos são simulados.</DemoBanner>
        {children}
      </main>
    </div>
  );
}
