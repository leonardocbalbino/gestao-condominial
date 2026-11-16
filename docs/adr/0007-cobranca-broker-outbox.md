# ADR-0007 — Cobrança, broker de pagamento e outbox transacional

- Status: aceito
- Data: 2026-11-16

## Decisões do produto (confirmadas)

- Sobra de centavos no rateio vai pelo **maior resto**.
- O **fundo de reserva** é um **% sobre a taxa ordinária**, por condomínio.

## Desenho

**Rateio** (função pura, com testes de unidade):

- Cada linha do orçamento aprovado é dividida pelo seu critério: fração ideal ou igualitário.
- **"Misto" = linhas com critérios diferentes** no mesmo orçamento. ⚠️ Esta é a interpretação adotada; confirmar com o produto.
- A fração ideal (`numeric(12,10)`) vira inteiro em 1e-10 com `BigInt`. Nunca float.
- O total do fundo de reserva usa arredondamento comercial e é distribuído na proporção da taxa de cada unidade, pelo maior resto.
- A emissão é **tudo ou nada**: qualquer pendência impede a emissão inteira (unidade sem fração, sem pagador ou pagador sem CPF).

**Encargos** (Código Civil, art. 1.336, §1º):

- Multa de até 2%, travada no schema, e juros padrão de 1% ao mês, configuráveis pela convenção.
- Os valores são copiados para a cobrança na emissão.
- O valor atualizado (multa única + juros simples pro rata die) é calculado no `@condo/contracts`, para web e app mostrarem o mesmo número.

**Broker.**

- Porta `PaymentProvider` com dois adaptadores:
  - **Fake**: em memória, gera os webhooks; proibido com `DEPLOY_ENV=production`.
  - **Asaas** (sandbox): subconta por condomínio, boleto híbrido com Pix, multa e juros nativos, split da tarifa da plataforma e pagamento de contas.
- A chave de API e o token do webhook de cada subconta ficam cifrados (AES-256-GCM).
- A emissão procura a referência no broker antes de criar, para não gerar boleto duplicado depois de uma falha.

**Webhooks idempotentes.**

- Endereço por condomínio: `/webhooks/:provider/:gestoraId/:condominioId`. A gestora da URL vira o contexto RLS. Uma URL forjada não acha a conta (404); token errado dá 401 e nada é gravado.
- O evento bruto vai para `payment_event`, com chave única `(provider, event_id)`, **antes** de processar.
- O processamento é assíncrono (outbox → fila).
- A baixa no razão usa `origem_ref` = id da cobrança no broker, com índice único.
- Reenvio, antes ou depois do processamento, não duplica a baixa.

**Lançamento da baixa** (regime de caixa):

- Débito: banco pelo valor líquido e tarifas (bruto − líquido).
- Crédito: itens da cobrança (taxa e fundo).
- Excedente pago: primeiro a multa calculada, o resto em juros.
- Pagamento a menor: distribuído entre os itens pelo maior resto.

**Contas a pagar.**

- Comprovante obrigatório.
- Aprovação do síndico; acima do limite configurado, segunda assinatura de um conselheiro.
- Quem cadastra não aprova, e as duas assinaturas são de pessoas diferentes (também por `CHECK` no banco).
- O pagamento é assíncrono pelo broker e vira despesa no razão com o comprovante.

**Conciliação.**

- Diária (`SystemJobs`, 06:00 de Brasília) e manual.
- O extrato da subconta é normalizado por operação (o Asaas soma bruto e tarifas da mesma cobrança).
- Cada linha casa com o lançamento de mesma origem e mesmo valor no banco; o resto vira exceção para a gestora (vincular ou justificar).
- **O mês não fecha com exceção aberta.** ⚠️ Esta regra foi adotada por controle; confirmar com o produto. O razão expõe `ClosingGuards` para isso, sem ler tabelas do billing.

**Outbox transacional (Redis + BullMQ).**

- O evento é gravado na mesma transação da mudança.
- O relay publica na fila depois do COMMIT (e a cada 2 s), com `jobId` = id do evento.
- O worker processa cada evento numa transação com o contexto RLS da gestora, como sistema (sem usuário), e audita.
- O relay e a conciliação diária usam a conexão `app_platform` com **grants de coluna**: só enxergam id, gestora, tópico e estado.

## Custos

- O Fake guarda estado em memória: a simulação reconstrói a partir do banco, mas a consulta de cobrança no Fake não sobrevive a reinício. Aceitável para dev e homologação.
- Valores para a API do Asaas viram reais com duas casas só na fronteira (`toReais`); internamente tudo é centavos.
- `app_platform` passa a servir também a processos de sistema, sempre com políticas e grants explícitos, nunca `BYPASSRLS`.
