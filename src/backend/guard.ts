import { redirect } from "next/navigation";
import { mfaPending, readSession } from "./auth";
import { linkTo } from "./host";
import type { Role } from "@/shared/permissions";

/** Protege as páginas no servidor: quem não pode entrar nem chega a receber a tela. */
export async function requireRole(roles: Role[]) {
  const r = await readSession();
  if (!r) redirect("/entrar");
  // Senha certa, mas falta o código do aplicativo autenticador.
  if (mfaPending(r)) redirect("/entrar?etapa=codigo");
  const user = r.user;
  if (!roles.includes(user.role)) {
    // Modo separado: o destino pode estar em outro host (endereço montado a partir da configuração).
    redirect(user.role === "driver" ? linkTo("app", "/motorista") : user.role === "passenger" ? linkTo("app", "/passageiro") : linkTo("admin", "/admin"));
  }
  return user;
}
