import { requireFoodDemo } from "@/backend/food";
import { DemoBanner } from "@/frontend/components/food/parts";

export const metadata = { title: "Orbi Food", robots: { index: false, follow: false } };

export default async function Layout({ children }: { children: React.ReactNode }) {
  await requireFoodDemo();
  return <><DemoBanner />{children}</>;
}
