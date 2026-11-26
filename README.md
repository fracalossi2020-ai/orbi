# Orbi — Sua direção, nosso compromisso.

Plataforma de mobilidade: site institucional, aplicativo do passageiro, aplicativo do motorista e painel administrativo, todos com os mesmos dados.

## Como rodar

Requer Node 22 ou mais novo.

```bash
npm install
npm run admin:create -- "Seu Nome" voce@empresa.com admin   # mostra a senha uma única vez
npm run dev                                                 # http://localhost:3000
```

O banco embutido (PGlite) fica em `.data/` e é criado sozinho. Pare o servidor antes de rodar `admin:create`, porque esse banco aceita um processo por vez.

| Endereço | O que é |
|---|---|
| `/` | Site |
| `/identidade` | As 4 identidades visuais, lado a lado, para escolher |
| `/status` | O que funciona, o que depende de terceiros e o que é demonstração |
| `/entrar` | Entrada única: o celular identifica quem já tem conta e leva quem é novo ao cadastro |
| `/passageiro`, `/motorista` | Aplicativos |
| `/admin` | Painel administrativo |

Para testar uma corrida sem GPS, entre como motorista e marque "Modo de teste", que deixa escolher a posição no mapa. Esse modo fica desligado em produção. A corrida exige um motorista com documentos, veículo e cadastro aprovados em `/admin/motoristas`.

## Testes

```bash
npm test                              # regras de preço, distribuição, permissões e estados
npx next build && npm run test:e2e    # corrida completa em navegador real, com banco descartável
```

Os testes de ponta a ponta usam `.data-e2e/`, apagado a cada execução, e nunca tocam no banco de desenvolvimento.

## Organização

```
src/shared/      Regras puras: preço, distribuição de corridas, permissões, estados da corrida
src/backend/      Motor de corridas, autenticação, mapas, pagamentos, eventos em tempo real
src/database/          Esquema, migrações e configuração inicial
src/app/api/     APIs REST
src/app/(site)/  Site institucional
src/app/passageiro, motorista, admin/   Aplicativos
src/frontend/lib/identities.ts + src/app/globals.css   As 4 identidades visuais
```

## Decisões que valem saber

- **Comissão:** nunca é fixa no código. Fica em cada tarifa (cidade + categoria), e um plano ativo pode substituí-la. As tarifas iniciais são marcadas como pendentes até um gestor revisá-las.
- **Quem paga o quê:** a comissão incide só sobre o valor bruto. Cupom é custeado pela Orbi e não reduz o líquido do motorista. A taxa de serviço continua existindo na tarifa (paga pelo passageiro), mas no lançamento é R$ 0 (decisão do dono, 21/11/2026): a receita da Orbi é só a comissão de 15%, e a tela esconde a linha quando a taxa é 0.
- **Clube Orbi:** no lançamento só existe o nível grátis (todo motorista aprovado vê as oficinas parceiras e usa o desconto de cada uma; a Orbi não cobra). O Básico pago acabou. Plus (R$ 129, 14%) e Pro (R$ 289, 13%) ficam desligados e aparecem como "em breve", até existirem crédito mensal, guincho e o código/QR da oficina, com 40 a 60 motoristas ativos. Assinar plano desligado dá 409. Valores em `src/shared/plans.ts`; `scripts/clube-gratis.ts` ajusta bancos antigos.
- **Corrida em dinheiro:** o motorista recebe tudo em mãos, e a parte da Orbi vira débito no saldo dele. Por isso o saldo pode ficar negativo.
- **Dívida do motorista:** a parte da Orbi nas corridas em dinheiro e no Pix direto vira saldo negativo. No limite (padrão R$ 150, em `/admin/configuracoes`; regra em `src/shared/debt.ts`) o motorista não fica online (409) nem recebe oferta, mas termina a corrida em andamento; com 70% do limite recebe aviso. A quitação é manual: ele paga na chave Pix da Orbi (também em configurações), toca em "Já paguei" em `/motorista/ganhos` (1 pedido pendente por vez) e a equipe confirma ou recusa (com motivo) em `/admin/pagamentos`. Só a confirmação lança o crédito no saldo. Cobrança combinada: toda segunda-feira.
- **Distribuição:** cada critério vira uma nota de 0 a 1, com pesos ajustáveis em `/admin/configuracoes`. Motorista novo começa com valores neutros, sem punição por falta de histórico.
- **Sem dados inventados:** a configuração inicial cria só cidades, modalidades, categorias e tarifas. Motoristas, corridas, pagamentos e parceiros só existem quando alguém os cadastra.
- **Conferência de dados:** `src/shared/validation.ts` confere CPF, CNH, CNPJ, placa, celular e chave Pix sem serviço externo; `src/backend/verify.ts` consulta o domínio do e-mail (DNS) e o CEP (ViaCEP). Isso barra erros e números inventados, mas não prova que o dado é da pessoa: para isso faltam SMS, link por e-mail e consulta a bases oficiais.
- **Novas cidades e modalidades:** cidade nova se resolve no painel (região + tarifas). Moto, motofrete, entregas e corporativo já existem como modalidades desligadas, com documentos próprios, mas ainda precisam das telas específicas.

## Antes de operar de verdade

1. Definir `DATABASE_URL` (há um `docker-compose.yml` com PostgreSQL) e `AUTH_SECRET`. O projeto só foi executado com o banco embutido: rode os testes contra o PostgreSQL real antes de confiar nele.
2. Guardar os documentos em armazenamento privado e criptografado. Hoje ficam no disco do servidor, em `.data/uploads`.
3. Contratar ou hospedar mapas, rotas e busca de endereços. Os serviços públicos usados agora (OpenFreeMap, OSRM, Photon) têm limites e não servem para produção.
4. Testar o Pix com credencial de sandbox e implementar cartão e transferência de saque.
5. Trocar o canal de eventos (`src/backend/bus.ts`) e o limite de tentativas de login (`src/backend/auth.ts`) por Redis se houver mais de uma instância: os dois funcionam em um único processo.
6. Definir `TRUST_PROXY_HOPS` com o número de proxies entre o usuário e o app (inteiro de 1 a 10, por exemplo `1` atrás de um balanceador da hospedagem). **Em produção de verdade (`NODE_ENV=production` com `DATABASE_URL`) o servidor não sobe sem essa variável**, porque sem ela todos os acessos contariam como um único IP nos limites de tentativa. `TRUST_X_REAL_IP=true` só vale junto de `TRUST_PROXY_HOPS`. Endereços IPv6 são agrupados pelo prefixo /64 nos limites, e chaves de quem já está bloqueado são as últimas a sair da memória quando o limite de chaves enche.
7. Configurar `SMTP_URL` e `MAIL_FROM`. Em produção, `PRUMO_MAIL_OUTBOX=true` é ignorado (com aviso no log), para os códigos de confirmação nunca ficarem gravados em disco.
8. Conferência antifraude da corrida: "cheguei" só vale a até 300 m da partida e "encerrar", a até 500 m do destino, depois de pelo menos 30% da duração estimada (mínimo de 1 min), sempre pela última posição do GPS do motorista (no máximo 2 min de idade). Fora de produção, ou com `ALLOW_MANUAL_LOCATION=true`, a conferência fica desligada (modo de teste); `PRUMO_RIDE_GUARDS=strict` a mantém ligada (usado nos testes e2e, com `PRUMO_COMPLETE_MIN_FACTOR=0` e `PRUMO_COMPLETE_MIN_S=0` para tirar só o tempo mínimo). Bônus por corrida ainda não é retido quando a corrida parece falsa: é decisão de produto pendente.
9. Fotos enviadas pelos motoristas passam por `sharp` (que já vem com o Next, mas **não está declarado no `package.json`**: declare-o antes de publicar) para remover o EXIF. Fora da produção, se a biblioteca não carregar, o app avisa no log e guarda a foto como veio; em produção de verdade o envio de imagens é recusado com erro claro.
10. Revisar juridicamente os termos e a política de privacidade, que são minutas, e checar a regulamentação municipal de transporte por aplicativo.
11. Configuração segura na subida (`src/instrumentation.ts`, regras em `src/shared/runtime-config.ts`): em produção de verdade o servidor se recusa a iniciar, listando todos os problemas, se houver `ALLOW_MANUAL_LOCATION=true`, `PRUMO_REQUIRE_STAFF_MFA=false`, `PRUMO_RIDE_GUARDS` diferente de `strict`, `PRUMO_COMPLETE_MIN_FACTOR` abaixo de 0,3 ou `PRUMO_COMPLETE_MIN_S` abaixo de 60, `DATABASE_URL` ausente ou `TRUST_PROXY_HOPS` ausente. "Produção de verdade" é `NODE_ENV=production` com `DATABASE_URL`; o modo "produção local" (sem `DATABASE_URL` e com `PRUMO_ALLOW_EMBEDDED_DB=true`, como o e2e) segue livre. Variáveis booleanas só valem com o texto exato `true`, e `PRUMO_ALLOW_EMBEDDED_DB` é ignorada quando `DATABASE_URL` existe.
12. Saque e troca da chave Pix pedem a senha atual (conta do Google: código enviado ao e-mail atual); o saque só vai para a chave cadastrada no perfil. A exclusão da conta também pede a senha de novo. Posições do motorista (`/api/driver/location`) exigem motorista online ou em corrida, dentro de uma região atendida e sem saltos acima de 45 m/s; saltos recusados ficam na auditoria (`driver.location_jump`) e "cheguei"/"encerrar" logo depois geram `ride.review_flag` para a equipe revisar. Decidir como a equipe usa isso (reter bônus, por exemplo) é pendência de produto.
13. Antes de aplicar a migração 0013 num banco que já tem dados, rode `DATABASE_URL=... npm run db:check-duplicates` (somente leitura, não altera nada). A 0013 cria índices únicos (`emergencies_ride_open`, `ledger_ride_settle`, `offers_ride_pending`, `offers_driver_pending`, `payments_ride`) que falham se houver duplicatas antigas; o script lista os grupos duplicados e os ids. A limpeza é manual (decida qual linha manter; no extrato, duplicata de `ride_net`/`cash_due` mexe no saldo do motorista), por isso não há migração automática de limpeza: ela teria de rodar antes da 0013, o que exigiria renumerar ou reescrever a 0013 e o journal. Sai com código 1 se achar duplicatas. Banco novo ou sem dados não precisa disso.
14. Três endereços (opcional, desligado por padrão). Com `SITE_URL` (site, `www`), `APP_URL` (app) e `ADMIN_URL` (painel), todas https e em hosts diferentes, o sistema se separa: `www` serve o site, `/creditos` e `/api/public`, sem sessão; `app` serve `/entrar`, `/cadastro`, `/passageiro`, `/motorista`, `/v/[token]` e a API (menos `/api/admin`); `admin` serve `/admin`, `/api/admin`, `/api/auth`, `/api/events` e tem tela de login própria. Cada host só atende o que é dele (host desconhecido: 421; caminho de API ou painel no host errado: 404; página do app ou do site no host errado: redirecionamento para o host da configuração). As sessões são separadas: `__Host-orbi_session` (app) e `__Host-orbi_admin` (painel), sem `Domain`, com escopo gravado no token; o app recusa a equipe e o painel recusa quem não é equipe. O Origin de um POST precisa ser o do próprio host. Em produção de verdade, definir só parte das três (ou http, ou hosts repetidos) impede a subida. O proxy da hospedagem deve repassar o `Host` original (ou definir `TRUST_PROXY=true` para o `x-forwarded-host` valer) e o Google OAuth deve apontar para `APP_URL/api/auth/google/callback`. Sem `SITE_URL` e `ADMIN_URL`, tudo roda em um host só, como antes.
   - Testar local: `*.localhost` resolve sozinho no Chrome. Suba em modo produção local, por exemplo: `PRUMO_ALLOW_EMBEDDED_DB=true AUTH_SECRET="$(cat .data/secret)" SITE_URL=http://www.localhost:3000 APP_URL=http://app.localhost:3000 ADMIN_URL=http://admin.localhost:3000 npx next start -p 3000` e abra `http://www.localhost:3000`, `http://app.localhost:3000` e `http://admin.localhost:3000/admin`. Outros navegadores e o `curl` podem precisar de `--resolve` ou de entradas no arquivo hosts. Teste automático: `e2e/hosts.spec.ts` (porta 3103).

15. Endurecimento de acesso (etapa 1): limites de tentativa de autenticação ficam no banco (`rate_limits`, limpos pelo sweeper); conta bloqueada por senha errada (atraso `min(2^(n-3),16)` s a partir da 3ª, 15 min na 10ª, 1 h na 20ª, 24 h na 30ª; "Esqueci a senha" desbloqueia); ações sensíveis do painel (dinheiro, equipe, suspensões, configurações, tarifas, planos, cupons, modalidades, regiões) pedem reautenticação de 5 min (código do autenticador; senha só quando `PRUMO_REQUIRE_STAFF_MFA=false`, ambiente de teste); contas da equipe nascem por convite de 24 h (`/convite/<token>`), e quem não ativa a segunda etapa nesse prazo é suspenso (só em produção ou com a exigência ligada); `ADMIN_ALLOWED_IPS` (IPv4, IPv6 ou CIDR, vírgulas; vazio = desligado) faz o painel responder 404 fora da lista; equipe tem 3 sessões e cai após 30 min parada (demais: 10); e-mail de "Novo acesso" e auditoria com IP mascarado. `/identidade` dá 404 em produção sem `PRUMO_SHOW_IDENTITY=true`. A subida em produção recusa também `PRUMO_SKIP_EMAIL_DNS`, endereços do Google trocados, `PRUMO_LOGIN_DELAY_SCALE` (só e2e), limites absurdos e `ADMIN_ALLOWED_IPS` mal formada. `npm run admin:create` só cria o primeiro administrador; os demais vão por convite no painel.

16. Endurecimento de acesso (etapa 2): formulários abertos (cadastro, contato, interessados, Orbi Moto) têm campo-isca `website` escondido por CSS (classe `hp-field`), carimbo de tempo assinado (`/api/public/form-stamp`; envio com menos de 3 s ou mais de 2 h é recusado em silêncio) e teto global por dia (cadastro 500, contato 300, moto 300, com alerta à equipe e 429). `PRUMO_FORM_GUARD_RELAX` só existe para o e2e e a produção recusa. "Esqueci a senha" sempre responde 200 com a mesma frase; `lookup` limita 5 consultas por hora por e-mail/celular e tem teto global (acima, responde `exists:false`). Só o administrador altera tarifas e planos (gestor só lê). O atendente vê CPF e CNH mascarados (botão "Revelar" audita `user.cpf_view`, 30 por hora). Baixar os dados da conta (`POST /api/me/export`) pede a senha (conta do Google: código no e-mail).

Itens de deploy do pré-lançamento (infraestrutura, fora do código):
- [ ] `AUTH_SECRET` guardado num cofre de segredos (não em arquivo no servidor).
- [ ] `TRUST_PROXY_HOPS` conferido com a quantidade real de proxies.
- [ ] Firewall liberando a origem só para a Cloudflare.
- [ ] Banco com o papel `orbi_app` sem DDL e `audit_log` só de inclusão.
- [ ] Backup cifrado, com teste de restauração.
- [ ] Cloudflare Access ou WAF na frente do painel.
- [ ] SPF, DKIM e DMARC no domínio de e-mail.
- [ ] DNSSEC e CAA no domínio.

17. Orbi Moto fica de fora do lançamento (decisão do dono): vem uns 60 a 120 dias depois, com piloto em Ipatinga, sem data prometida. A modalidade `corrida-moto` nasce desligada e deve continuar assim até lá; ninguém consegue cadastrar moto enquanto estiver desligada (a lista de categorias do cadastro e `POST /api/driver/vehicle` só aceitam modalidade ativa). O aviso "Orbi Moto: em breve" (`MotoSoon`) aparece em /passageiro/dirigir, no cadastro do motorista, em /motoristas e em /motoristas/requisitos, e o botão "Quero ser avisado" grava um interessado (`leads.kind = "moto"`, visível em /admin/interessados). Limitação conhecida: o atalho "Moto" da tela de início do passageiro ainda aparece se QUALQUER cidade tiver moto ligada, porque ali a cidade do passageiro ainda não é conhecida; depois que a partida ou o GPS são definidos, só vale a cidade que cobre esse ponto. Ao ligar a moto, ligue só a cidade do piloto (Ipatinga) e confira o atalho.

## Créditos

Mapas © colaboradores do OpenStreetMap.
