/**
 * Cria a PRIMEIRA conta administrativa (bootstrap). Pare o servidor antes se estiver usando o banco embutido.
 * Depois que existe um administrador ativo, o script recusa: novas contas da equipe nascem por convite no painel
 * (Equipe, e-mail com link de 24 h, a pessoa escolhe a senha e ativa a segunda etapa). Só volta a criar se não restar
 * nenhum administrador ativo (recuperação).
 * Uso: npm run admin:create -- "Nome" email@empresa.com [admin|gestor|atendente]
 * A senha é gerada aqui e aparece uma única vez.
 */
import { randomBytes, scrypt as scryptCb } from "node:crypto";
import { promisify } from "node:util";
import { and, eq } from "drizzle-orm";
import { getDb, schema as s } from "../src/database";

const scrypt = promisify(scryptCb) as (p: string, salt: Buffer, len: number) => Promise<Buffer>;

async function main() {
  const [name, email, role = "admin"] = process.argv.slice(2);
  if (!name || !email || !["admin", "gestor", "atendente"].includes(role)) {
    console.error('Uso: npm run admin:create -- "Nome" email@empresa.com [admin|gestor|atendente]');
    process.exit(1);
  }
  const db = await getDb();
  const [active] = await db.select({ id: s.users.id }).from(s.users).where(and(eq(s.users.role, "admin"), eq(s.users.status, "active"))).limit(1);
  if (active) {
    console.error("Já existe um administrador ativo. Crie novas contas da equipe pelo painel (Equipe): a pessoa recebe um convite por e-mail e define a própria senha.");
    process.exit(1);
  }
  const password = process.env.PRUMO_ADMIN_PASSWORD || randomBytes(12).toString("base64url");
  const salt = randomBytes(16);
  const key = await scrypt(password, salt, 64);
  await db.insert(s.users).values({
    name, email: email.toLowerCase(), role: role as "admin", passwordHash: `${salt.toString("hex")}:${key.toString("hex")}`, privacyAcceptedAt: new Date(),
  });
  console.log(`\nConta criada: ${email} (${role})\nSenha: ${password}\nGuarde agora: ela não será mostrada de novo.\nNo primeiro acesso, ative a verificação em duas etapas (obrigatória para a equipe).\n`);
  process.exit(0);
}
main().catch((e) => { console.error(e.message); process.exit(1); });
