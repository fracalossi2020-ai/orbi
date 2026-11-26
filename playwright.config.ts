import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 180_000,
  workers: 1,
  fullyParallel: false,
  reporter: [["list"]],
  use: { launchOptions: { args: ["--use-gl=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist", "--enable-unsafe-swiftshader"] }, baseURL: "http://localhost:3100", trace: "retain-on-failure", screenshot: "only-on-failure" },
  webServer: [
    { command: "npx tsx scripts/e2e-server.ts", url: "http://localhost:3100", timeout: 120_000, reuseExistingServer: false, stdout: "pipe" },
    // Modo com três endereços (www/app/admin em *.localhost); só e2e/hosts.spec.ts usa. Espera só a porta (localhost puro é host desconhecido aqui, 421).
    { command: "npx tsx scripts/e2e-hosts-server.ts", port: 3103, timeout: 120_000, reuseExistingServer: false, stdout: "pipe" },
    // Mesmo modo, com a segunda etapa da equipe obrigatória (e2e/hosts-mfa.spec.ts).
    { command: "npx tsx scripts/e2e-hosts-server.ts 3104 mfa", port: 3104, timeout: 120_000, reuseExistingServer: false, stdout: "pipe" },
  ],
});
