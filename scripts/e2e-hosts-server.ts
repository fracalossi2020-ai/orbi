/**
 * Sobe a versão de produção no modo com três endereços (www / app / admin em *.localhost), com banco descartável próprio.
 * Sem argumentos: porta 3103, equipe sem a segunda etapa obrigatória (e2e/hosts.spec.ts). Com "3104 mfa": a segunda etapa da
 * equipe obrigatória, como em produção (e2e/hosts-mfa.spec.ts). O servidor principal dos testes (porta 3100) segue em um host só.
 */
import { execFileSync, spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const PORT = Number(process.argv[2] ?? 3103);
const MFA = process.argv[3] === "mfa";
const dir = path.join(process.cwd(), MFA ? ".data-e2e-hosts-mfa" : ".data-e2e-hosts");
fs.rmSync(dir, { recursive: true, force: true });

const env = {
  ...process.env, PRUMO_DATA_DIR: dir, PRUMO_ALLOW_EMBEDDED_DB: "true", AUTH_SECRET: "e2e-hosts-secret-e2e-hosts-secret-e2e-hosts",
  PRUMO_ADMIN_PASSWORD: "e2e-admin-password", PRUMO_SKIP_EMAIL_DNS: "true", PRUMO_MAIL_OUTBOX: "true",
  PRUMO_REQUIRE_STAFF_MFA: MFA ? "true" : "false", PRUMO_WRITE_LIMIT: "100000", TRUST_PROXY_HOPS: "1", PRUMO_LOGIN_DELAY_SCALE: "0", ...(MFA ? {} : { PRUMO_FORM_GUARD_RELAX: "true" }),
  // No servidor com a segunda etapa obrigatória, o painel só atende 10.8.x (os testes mandam x-forwarded-for 10.8.0.n); outros IPs recebem 404.
  ...(MFA ? { ADMIN_ALLOWED_IPS: "10.8.0.0/16" } : {}),
  SITE_URL: `http://www.localhost:${PORT}`, APP_URL: `http://app.localhost:${PORT}`, ADMIN_URL: `http://admin.localhost:${PORT}`,
};
// O modo de um host só do servidor principal não pode vazar para este (nem o contrário).
delete (env as Record<string, string | undefined>).TRUST_PROXY;
execFileSync(process.execPath, ["node_modules/tsx/dist/cli.mjs", "scripts/create-admin.ts", "Admin de teste", "admin@e2e.prumo.test", "admin"], { env, stdio: "inherit" });
const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-p", String(PORT)], { env: { ...env, NODE_ENV: "production" }, stdio: "inherit" });
process.on("SIGTERM", () => server.kill());
process.on("SIGINT", () => server.kill());
server.on("exit", (code) => process.exit(code ?? 0));
