import { requireRole } from "@/backend/guard";
import { PASSENGER_APP } from "@/shared/permissions";
import { foodDemoEnabled } from "@/backend/food";
import { PassengerShell } from "./shell";

export const metadata = { title: "Passageiro" };

export default async function Layout({ children }: { children: React.ReactNode }) {
  // Motorista também é passageiro: usa este app para pedir corridas quando está offline.
  await requireRole(PASSENGER_APP);
  return <PassengerShell food={await foodDemoEnabled()}>{children}</PassengerShell>;
}
