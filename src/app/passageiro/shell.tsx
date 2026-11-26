"use client";
import { usePathname } from "next/navigation";
import { AppShell } from "@/frontend/components/app/AppShell";

const HOME = { href: "/passageiro", label: "Início", icon: "home", img: "car" as const };
/** Aba do Orbi Food (demonstração): só aparece com PRUMO_FOOD_DEMO=true no servidor. */
const FOOD = { href: "/passageiro/food", label: "Food", icon: "store", img: "food" as const };
const REST = [
  { href: "/passageiro/viagens", label: "Viagens", icon: "history", img: "receipt" as const },
  { href: "/passageiro/ajuda", label: "Ajuda", icon: "help", img: "chat" as const },
  { href: "/passageiro/conta", label: "Conta", icon: "user", img: "user" as const },
];

/** Subtelas fora do padrão: "Quero dirigir" volta para a Conta, onde fica o convite. */
const BACK_EXCEPTIONS = { "/passageiro/dirigir": "/passageiro/conta" };

export function PassengerShell({ children, food = false }: { children: React.ReactNode; food?: boolean }) {
  const nav = food ? [HOME, FOOD, ...REST] : [HOME, ...REST];
  return <AppShell nav={nav} title="Passageiro" topNav backExceptions={BACK_EXCEPTIONS} flush={usePathname() === "/passageiro"}>{children}</AppShell>;
}
