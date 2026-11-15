# Prompt para agente de código — Plataforma de Gestão Condominial

> Trabalhe **uma fase por vez**. Ao terminar cada fase, pare, rode os testes, mostre o resumo do que foi feito e aguarde aprovação antes de seguir.

---

## 0. Decisões já tomadas (registradas em `docs/adr/`)

- ORM: **Drizzle**, com migrações em SQL escritas à mão (ADR-0001).
- Tenancy: RLS com `app.gestora_id` setado por transação; papéis de banco `app_owner`, `app_user`, `app_platform` (ADR-0002).
- Identidade: `app_user` (login) é **global**; `person` é por gestora e aponta para o usuário. Existe **super admin da plataforma**, acessado por caminho separado (`/platform`, papel de banco `app_platform`), nunca com `BYPASSRLS` (ADR-0003).
- Auditoria encadeada por hash, uma cadeia por gestora + cadeia `platform` (ADR-0004).
- Node 22 LTS (`.nvmrc`), CI no GitHub Actions.

## 1. Papel e objetivo

Você é um engenheiro de software sênior construindo um SaaS multi-tenant de gestão condominial para o mercado brasileiro.

- O **cliente pagante é a empresa gestora**. Ela administra condomínios e enxerga todos eles.
- Hierarquia de **dois níveis**: `Empresa gestora → Condomínio → (Torre/Bloco → Unidade)`. Não existe administradora intermediária.
- Cada condomínio é uma "pasta" autocontida: CNPJ próprio, subconta própria no broker de pagamento, plano de contas, orçamento, documentos e período contábil independentes.
- Os pilares do produto, em ordem de prioridade:
  1. Cobrança da taxa condominial via broker de pagamento (boleto híbrido + Pix, cartão opcional), com baixa automática e conciliação.
  2. **Prestação de contas** contínua, auditável e aprovada pelo conselho dentro do sistema.
  3. App e web **responsivos e simples**, pensados para moradores com pouca familiaridade com tecnologia.

## 2. Stack obrigatória

| Camada           | Tecnologia                                                                                                                            |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Monorepo         | pnpm workspaces + Turborepo                                                                                                           |
| Backend          | Node.js 22 + TypeScript (strict) + NestJS, **monólito modular**                                                                       |
| ORM / migrações  | Prisma **ou** Drizzle (escolha um e justifique no README); migrações versionadas                                                      |
| Banco            | PostgreSQL 16 com Row-Level Security e extensão `ltree`                                                                               |
| Filas            | Redis + BullMQ, com padrão **transactional outbox**                                                                                   |
| Arquivos         | Storage S3-compatível (MinIO em dev) com versionamento                                                                                |
| Web              | Next.js (App Router) + Tailwind, mobile-first                                                                                         |
| Mobile           | React Native + Expo (iOS e Android), Expo Router                                                                                      |
| UI compartilhada | Pacote `packages/ui` com tokens de design (cores, tipografia, espaçamento) usados por web e mobile; suporte a white label por gestora |
| Validação        | Zod nos contratos compartilhados (`packages/contracts`)                                                                               |
| Testes           | Vitest/Jest (unit), Supertest (API), Playwright (web), testes de isolamento de tenant                                                 |
| Observabilidade  | OpenTelemetry + logs estruturados (pino)                                                                                              |
| Dev local        | Docker Compose (Postgres, Redis, MinIO, Mailpit)                                                                                      |

### Estrutura de pastas

```
apps/
  api/            # NestJS
  web/            # Next.js (painel gestora/síndico/conselho + portal do morador + portal de transparência)
  mobile/         # Expo (morador, síndico/conselho, modo portaria em tablet)
packages/
  contracts/      # schemas Zod + tipos compartilhados
  ui/             # design system e tokens
  config/         # eslint, tsconfig, prettier
infra/
  docker-compose.yml
docs/
  adr/            # decisões de arquitetura
```

### Módulos do backend (`apps/api/src/modules/`)

`identity` (auth, 2FA, RBAC) · `org` (gestora, condomínio, torres, unidades, pessoas, veículos) · `ledger` (razão contábil) · `billing` (rateio, cobranças, broker) · `accountability` (fechamento, revisão, publicação, pasta digital) · `documents` (anexos) · `communication` (comunicados, avisos, push) · `amenities` (reservas) · `parking` (vagas) · `leasing` (locações) · `gate` (visitas, encomendas, prestadores) · `audit`.

Regra: um módulo **não acessa tabelas de outro**. Comunicação entre módulos por serviços públicos do módulo ou eventos de domínio.

## 3. Regras não negociáveis

1. **Dinheiro**: sempre inteiro em centavos (`bigint`) ou `NUMERIC(14,2)`. Nunca `float`.
2. **Isolamento de tenant**: toda tabela de domínio tem `gestora_id`. RLS ativa em todas elas, com política baseada em `current_setting('app.gestora_id')`. O contexto é setado por request numa transação. Uma consulta sem contexto retorna zero linhas. Há testes automatizados provando que a gestora A não lê dados da gestora B.
3. **Razão contábil imutável**: partidas dobradas, soma das linhas = 0. Nada é editado ou apagado; correção é **estorno** com motivo.
4. **Período fechado não muda**: o fechamento grava um hash SHA-256 do conjunto de lançamentos. Ajuste posterior entra no período aberto, referenciando o original.
5. **Sem comprovante, sem despesa**: lançamento de saída exige anexo. O arquivo recebe hash SHA-256 no upload.
6. **Webhooks idempotentes**: evento bruto gravado em `payment_event` com chave única `(provider, event_id)` antes de processar. Processamento assíncrono via fila. Reenvio nunca duplica baixa.
7. **Auditoria**: `audit_log` append-only, encadeado por hash (cada linha guarda o hash da anterior). Registra ator, ação, recurso, antes/depois e IP.
8. **Permissão = papel + escopo**: toda ação passa por `can(user, permission, resource)` central. O mesmo usuário pode ter papéis diferentes em condomínios diferentes.
9. **LGPD**: CPF e dados bancários mascarados na UI. Inadimplência nominal visível só para gestora, síndico e conselho; morador vê apenas agregado. Acesso a dado sensível é auditado.
10. **Segredos** nunca no código. Chaves do broker por subconta guardadas cifradas.

## 4. Modelo de dados (mínimo)

| Entidade                                      | Campos principais                                                                                                                                                                                         |
| --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `gestora`                                     | id, nome, cnpj, branding (logo, cores, domínio)                                                                                                                                                           |
| `condominio`                                  | id, gestora_id, nome, cnpj, endereço, config (módulos ligados, regras de rateio, multa/juros, limites de aprovação, regras de locação/vagas), provider_account_id                                         |
| `block`                                       | id, condominio_id, nome (Torre A, Bloco 2), andares                                                                                                                                                       |
| `unit`                                        | id, condominio_id, block_id, andar, numero, tipo (apto, casa, sala, loja), fracao_ideal                                                                                                                   |
| `person`                                      | id, gestora_id, cpf, nome, telefone, email                                                                                                                                                                |
| `vehicle`                                     | id, unit_id, placa, modelo, cor                                                                                                                                                                           |
| `user`                                        | id, person_id, auth (senha hash, 2FA, biometria/link mágico)                                                                                                                                              |
| `role` / `permission` / `role_assignment`     | papéis como dados; atribuição = user + role + escopo (gestora, condominio ou unit) + validade                                                                                                             |
| `unit_access_grant`                           | unit_id, person_id, perfil (proprietário, secundário, inquilino, dependente, hóspede), permissões marcadas (avisos, reservas, portaria, pagamento, contas), concedido_por, início, fim, status do convite |
| `account`                                     | plano de contas: código, nome, natureza, grupo (ordinária, fundo de reserva, obras)                                                                                                                       |
| `journal_entry` / `journal_line`              | data competência, data caixa, histórico, period_id, created_by; linhas débito/crédito                                                                                                                     |
| `attachment`                                  | entry_id, tipo, sha256, storage_key                                                                                                                                                                       |
| `budget` / `budget_line`                      | previsão orçamentária anual por conta                                                                                                                                                                     |
| `charge` / `charge_item`                      | unit_id, competência, vencimento, valor, status, provider_charge_id; itens apontando para contas                                                                                                          |
| `payment_event`                               | provider, event_id (único), payload, recebido_em, processado_em                                                                                                                                           |
| `bank_statement_line`                         | data, valor, descrição, match_entry_id                                                                                                                                                                    |
| `accounting_period`                           | condominio_id, mês, status (aberto, em_revisao, aprovado, publicado), hash                                                                                                                                |
| `review_item` / `review_comment` / `approval` | revisão do conselho por lançamento (ok, dúvida, ressalva) e assinaturas                                                                                                                                   |
| `lease_contract`                              | unit_id, tipo (longa, temporada), pessoas, início, fim, responsável pela taxa, status, anexo                                                                                                              |
| `guest_stay`                                  | lease_contract_id, hóspedes (nome, documento), veículos, check-in, check-out                                                                                                                              |
| `parking_space`                               | condominio_id, identificação, tipo (fixa, rotativa, extra, visitante), unidade dona                                                                                                                       |
| `parking_assignment`                          | space_id, beneficiário (unit/person), modalidade (cessão, aluguel entre condôminos, aluguel do condomínio), valor, início, fim, aprovado_por                                                              |
| `amenity` / `reservation`                     | áreas comuns, regras, reservas, taxa, caução                                                                                                                                                              |
| `visitor_pass`                                | unit_id, nome, validade, QR, entrada/saída                                                                                                                                                                |
| `service_provider`                            | do condomínio (CNPJ, contrato, documentos com validade) ou da unidade (dias/horários liberados)                                                                                                           |
| `announcement` / `announcement_read`          | comunicados e confirmação de leitura                                                                                                                                                                      |
| `home_preference`                             | user_id, ordem e visibilidade dos cards                                                                                                                                                                   |
| `audit_log`                                   | ator, ação, recurso, before, after, ip, prev_hash, hash                                                                                                                                                   |

## 5. Broker de pagamento

- Crie a porta `PaymentProvider` com: `createSubaccount`, `createCharge`, `cancelCharge`, `getCharge`, `listStatement`, `payBill`, `parseWebhook`, `verifyWebhook`.
- Implemente o adaptador **Asaas** (sandbox) como primeiro provedor: subconta por condomínio, boleto, Pix, cartão, split, webhooks, pagamento de contas.
- Implemente também um adaptador **Fake** para testes e dev local, que simula pagamentos e webhooks.
- O dinheiro do condomínio entra **sempre** na subconta do condomínio. A plataforma nunca custodia.
- Tarifa da plataforma via split. Taxa de administração da gestora como **despesa do condomínio com nota fiscal** (aparece na prestação de contas).
- Encargos de atraso conforme a convenção, limitados ao Código Civil (art. 1.336, §1º: multa até 2%, juros de 1% ao mês salvo convenção). Segunda via recalcula automaticamente.
- Conciliação diária: job que puxa o extrato da subconta e casa cada linha com lançamentos; divergência vai para fila de exceções da gestora.
- Contas a pagar: só com comprovante anexado e aprovação do síndico; acima do limite configurado, segunda aprovação (conselheiro).

## 6. Prestação de contas

Fluxo mensal: `lançamentos diários (com comprovante) → fechamento pela gestora (período travado + hash) → revisão do conselho (cada lançamento: ok / dúvida / ressalva, com comentários) → se ressalva, gestora ajusta por estorno e reabre → síndico assina → publicação (pasta digital + portal) → anual: demonstrativo do exercício para a AGO`.

Relatórios gerados: balancete; receitas × despesas; previsto × realizado; saldos por conta e por fundo; inadimplência nominal (restrita) e agregada; extrato + conciliação; **pasta digital em PDF** (capa, sumário, relatórios, extratos, comprovantes na ordem dos lançamentos, parecer do conselho, assinatura do síndico); demonstrativo anual.

Portal de transparência do morador: cada gasto com comprovante a um clique, gráfico de destino do dinheiro e evolução do fundo de reserva. O condomínio escolhe entre modo tempo real ou só após publicação.

Papel de auditor externo com leitura temporária e exportação do período (lançamentos + anexos + log) num pacote verificável por hash.

## 7. Experiência do usuário

### Tela inicial do morador (web e app), nesta ordem

1. **Pendência financeira**: boleto vencendo nos próximos dias ou em atraso, com valor atualizado e botões "Pagar com Pix", "Copiar código", "2ª via". Destaque visual em atraso.
2. **Comunicados e avisos não lidos**, com botão "Li e entendi". Só saem do topo depois de confirmados; confirmação registrada.
3. **Avisos do dia**: visita chegando, encomenda na portaria, reserva amanhã.
4. **Atalhos em cards grandes** (ícone + uma palavra, dois por linha): Boletos, Reservas, Visitas, Encomendas, Contas, Mais.

### Cards e ocultação

- Nível condomínio: a gestora liga/desliga módulos. Módulo desligado não aparece para ninguém.
- Nível usuário: "Personalizar atalhos" para ocultar, reordenar e restaurar padrão. Oculto continua em "Mais". **Pendências nunca podem ser ocultadas.**
- O mesmo padrão de cards configuráveis vale para os painéis de síndico, conselho e gestora.

### Acessibilidade e simplicidade

- Fonte grande e ajustável, alto contraste, alvos de toque ≥ 48px, sempre ícone + texto.
- Linguagem do dia a dia ("Sua taxa de outubro"), nunca jargão contábil para o morador.
- Pagar em no máximo dois toques a partir da tela inicial.
- Login do morador por biometria ou link mágico (WhatsApp/SMS/e-mail). 2FA obrigatório para gestora, síndico e conselho.
- VoiceOver/TalkBack, meta WCAG 2.1 AA. Tour curto no primeiro acesso. Botão fixo "Falar com a gestora".
- Web responsiva mobile-first: tabelas viram cartões no celular. Cache local para conexão fraca (boletos, comunicados, lista de visitas na portaria).

### Acessos na unidade

- Proprietário (cadastrado pela gestora) vê tudo da unidade.
- Proprietário cadastra **moradores secundários** e marca o que cada um vê.
- **Inquilino**: proprietário cadastra (nome, CPF, contato, período) → inquilino recebe convite → proprietário marca permissões conforme contrato (avisos, reservas, portaria, pagamento, contas). Se o pagamento for do inquilino, o boleto vai para ele e o proprietário recebe cópia e aviso de atraso. O acesso expira automaticamente no fim do contrato e o proprietário é avisado.
- Inquilino pode cadastrar dependentes dentro do que ele mesmo tem.

## 8. Visão do síndico: locações e vagas

Painel com cards: Locações vigentes (longa / temporada) · Vencendo em 30 dias · Temporada hoje (entradas e saídas) · Mapa de vagas (própria, cedida, alugada, livre) · Pendências de aprovação · Alertas (veículo sem vaga, temporada sem lista de hóspedes, vaga cedida a não condômino).

- **Locação**: tipos longa duração e temporada (temporada = até 90 dias, Lei 8.245/1991, art. 48; classificar pelo prazo). Temporada exige check-in/out, nº máximo e lista de hóspedes com documento e placa; portaria libera só no período; hóspede vê apenas avisos e regras.
- Se a convenção restringir temporada ou locação por aplicativo, a configuração do condomínio bloqueia o cadastro ou exige aprovação do síndico.
- **Vagas**: cessão gratuita, aluguel entre condôminos, aluguel de vaga do condomínio. Campos: vaga, dono, beneficiário, veículos, prazo, valor, quem recebe.
- **Regra legal**: bloquear beneficiário externo ao condomínio por padrão (Código Civil, art. 1.331, §1º); liberar só se a configuração do condomínio indicar autorização na convenção.
- Aluguel de vaga do condomínio entra no boleto da unidade beneficiária e como receita na prestação de contas.

Permissões: gestora tudo; síndico cadastra, aprova e vê painel; conselho leitura; proprietário cadastra contratos da sua unidade e cede/aluga a sua vaga; inquilino vê só o próprio contrato. Contrato anexado: só gestora, síndico, proprietário e o próprio inquilino.

## 9. Matriz de permissões base

| Ação                                           | Gestora | Síndico      | Conselho                | Morador        |
| ---------------------------------------------- | ------- | ------------ | ----------------------- | -------------- |
| Criar condomínio / convidar síndico e conselho | Sim     | Não          | Não                     | Não            |
| Convidar moradores                             | Sim     | Sim          | Não                     | Não            |
| Lançar receitas e despesas                     | Sim     | Configurável | Não                     | Não            |
| Aprovar pagamento acima do limite              | Não     | Sim          | 2ª assinatura (config.) | Não            |
| Fechar o mês                                   | Sim     | Não          | Não                     | Não            |
| Revisar/aprovar prestação de contas            | Leitura | Assina       | Aprova ou ressalva      | Não            |
| Inadimplência nominal                          | Sim     | Sim          | Sim                     | Não (agregado) |
| Balancete e pasta publicados                   | Sim     | Sim          | Sim                     | Sim            |
| Boletos e extrato da própria unidade           | —       | —            | —                       | Sim            |
| Ver todos os condomínios                       | Sim     | Não          | Não                     | Não            |

Papéis são dados: a gestora pode criar papéis customizados (assistente financeiro, zelador, porteiro) a partir de permissões granulares.

## 10. Fases de implementação

Para cada fase: escreva um ADR curto em `docs/adr/` se tomar decisão relevante, implemente com testes, rode `pnpm lint && pnpm test`, atualize o README e **pare para revisão**.

### Fase 0 — Fundação

- Monorepo, Docker Compose, CI (lint, typecheck, testes).
- Tenancy com RLS + testes de isolamento.
- Auth (senha + 2FA para staff, link mágico para morador), RBAC com escopo, `can()` central, guards no NestJS.
- `audit_log` encadeado por hash.
- Design system base em `packages/ui` com tokens e tema white label.

**Aceite:** teste prova que gestora A não lê dados da gestora B; login com 2FA funciona; toda mutação gera linha de auditoria.

### Fase 1 — MVP financeiro + web responsivo + app mobile

- Cadastro: condomínio, torres/blocos (com geração automática "Torre A, 10 andares, 4 por andar" e importação CSV), unidades, pessoas, veículos.
- Plano de contas padrão por gestora, orçamento anual, rateio (fração ideal, igualitário, misto).
- `PaymentProvider` + adaptadores Asaas (sandbox) e Fake; subconta por condomínio.
- Emissão de cobranças (boleto híbrido + Pix), webhooks idempotentes, baixa automática no razão.
- Contas a pagar com anexo obrigatório e aprovação; conciliação diária; fila de exceções.
- Balancete e fechamento mensal com hash.
- Web responsivo (painel gestora/síndico) e app Expo do morador com tela inicial priorizada (pendência → comunicados → cards), boletos, Pix copia-e-cola, extrato e comunicados.

**Aceite:** fluxo ponta a ponta com o adaptador Fake — gerar rateio, emitir cobrança, simular pagamento por webhook (incluindo webhook duplicado), ver baixa, conciliar e fechar o mês com balancete correto.

### Fase 2 — Prestação de contas completa

- Revisão do conselho por lançamento, comentários, ressalva → estorno → reabertura.
- Assinatura do síndico, publicação, pasta digital em PDF.
- Portal de transparência (web e app).
- Régua de cobrança, acordos parcelados, segunda via com recálculo.
- Auditor externo e exportação verificável.

**Aceite:** um mês sai de "aberto" até "publicado" passando por uma ressalva; o PDF contém todos os comprovantes na ordem; morador vê só agregado de inadimplência.

### Fase 3 — Engajamento e operação

- Personalização de cards (ocultar/reordenar) em todos os perfis.
- Acessos na unidade: secundários, inquilino com convite e permissões por contrato, expiração automática.
- Reservas, gestão de garagem (mapa, cessão, aluguel), locações (longa e temporada) no painel do síndico, liberação de visitas por QR, prestadores, encomendas, chamados, documentos.
- Modo portaria em tablet (Expo) com leitura de QR e cache offline.
- Tudo entregue no web e no app ao mesmo tempo.

**Aceite:** proprietário cadastra inquilino com permissão de pagamento → boleto passa a ir para o inquilino → proprietário recebe aviso de atraso → acesso expira na data de fim. Vaga não pode ser cedida a não condômino sem a flag do condomínio.

### Fase 4 — Expansão

- Assembleia online com votação por fração ideal, consumo (água/gás), segundo provedor de pagamento, importação de outros sistemas, BI consolidado da gestora.

## 11. Como trabalhar

- Commits pequenos e descritivos. Nada de código morto ou TODO sem issue.
- Quando uma regra deste documento conflitar com uma conveniência técnica, siga a regra e explique o custo.
- Se algo estiver ambíguo (regra de negócio, legal ou contábil), pergunte antes de inventar.
- Nunca use credenciais reais; use sandbox do broker e dados fictícios nos seeds.
