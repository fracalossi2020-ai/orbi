import { redirect } from "next/navigation";

/** Cadastro: abre a entrada direto em "criar conta", mantendo o perfil escolhido. */
export default async function Cadastro({ searchParams }: { searchParams: Promise<{ perfil?: string }> }) {
  const { perfil } = await searchParams;
  redirect(perfil === "motorista" || perfil === "passageiro" ? `/entrar?etapa=cadastro&perfil=${perfil}` : "/entrar?etapa=cadastro");
}
