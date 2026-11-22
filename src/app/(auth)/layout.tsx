import { headers } from "next/headers";
import { redirect } from "next/navigation";
import AppSplash from "@/frontend/components/app/AppSplash";
import { currentUser } from "@/backend/auth";

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  // Quem já entrou abre direto na própria tela, como em um aplicativo.
  // Passageiro que veio por "Quero dirigir" (?perfil=motorista, lido pelo proxy) vai para "Seja motorista".
  const user = await currentUser();
  if (user) {
    const forDriver = (await headers()).get("x-perfil") === "motorista";
    redirect(user.role === "driver" ? "/motorista" : user.role === "passenger" ? (forDriver ? "/passageiro/dirigir" : "/passageiro") : "/admin");
  }
  // A tela de entrada monta o próprio layout (painel com a animação e o formulário); aqui fica só a abertura.
  return (
    <>
      <AppSplash />
      <div className="min-h-svh bg-bg text-ink">{children}</div>
    </>
  );
}
