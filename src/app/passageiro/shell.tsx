"use client";
import { usePathname } from "next/navigation";
import { AppShell } from "@/frontend/components/app/AppShell";

const NAV = [
  { href: "/passageiro", label: "Início", icon: "home", img: "car" as const },
  { href: "/passageiro/viagens", label: "Viagens", icon: "history", img: "receipt" as const },
  { href: "/passageiro/ajuda", label: "Ajuda", icon: "help", img: "chat" as const },
  { href: "/passageiro/conta", label: "Conta", icon: "user", img: "user" as const },
];

/** Subtelas fora do padrão: "Quero dirigir" volta para a Conta, onde fica o convite. */
const BACK_EXCEPTIONS = { "/passageiro/dirigir": "/passageiro/conta" };

export function PassengerShell({ children }: { children: React.ReactNode }) {
  return <AppShell nav={NAV} title="Passageiro" topNav backExceptions={BACK_EXCEPTIONS} flush={usePathname() === "/passageiro"}>{children}</AppShell>;
}
