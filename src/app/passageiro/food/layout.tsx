import { requireFoodDemo } from "@/backend/food";

export const metadata = { title: "Orbi Food", robots: { index: false, follow: false } };

/** Sem a faixa de demonstração: a aba do passageiro mostra o Food como será. Os dados das lojas seguem fictícios, então só ligue PRUMO_FOOD_DEMO fora de produção pública. */
export default async function Layout({ children }: { children: React.ReactNode }) {
  await requireFoodDemo();
  return <>{children}</>;
}
