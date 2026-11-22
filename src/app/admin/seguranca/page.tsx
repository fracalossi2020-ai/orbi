"use client";
import { PageTitle } from "@/frontend/components/app/AppShell";
import { SecurityPanel } from "@/frontend/components/app/SecurityPanel";

export default function Page() {
  return <><PageTitle sub="Senha, verificação em duas etapas e aparelhos conectados.">Minha segurança</PageTitle><SecurityPanel /></>;
}
