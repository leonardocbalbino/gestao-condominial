# ADR-0009 — Painel da equipe mais denso que o app do morador

- Status: aceito
- Data: 2026-11-16

## Contexto

O §7 pede letra grande e alvos de toque ≥ 48px, pensando no morador com pouca familiaridade com tecnologia. Aplicado ao painel da gestora, síndico e conselho, isso gerou telas pesadas: formulários de largura total, campos e botões enormes, pouca informação por tela. Quem usa o painel trabalha nele o dia todo, quase sempre no computador.

## Decisão

**Duas densidades, os mesmos componentes.**

- **Morador e telas públicas** (`/morador`, `/entrar`): raiz de 18px, alvos ≥ 48px e controles grandes, como no §7.
- **Painel** (`.painel`):
  - raiz de 16px;
  - texto de 15px, título da página 28/700, título de cartão 18/600, legenda 13/500;
  - botões `md` de 44px e `sm` de 36px, campos de 44px;
  - cartão com raio de 12px e padding de 24px.
- Os componentes de `components/ui.tsx` medem em `rem`. A mesma classe dá 44px no painel e ~50px no morador. A troca é feita por `html:has(.painel)`, sem duplicar componente.
- O "A+" continua ampliando tudo nas duas áreas, porque tamanhos e espaçamentos são relativos à raiz.

**Acessibilidade mantida no painel:**

- O alvo mínimo do WCAG 2.2 AA (2.5.8) é 24px; 36px e 44px atendem com folga.
- Texto com contraste ≥ 4.5:1 em todos os pares da paleta, testado em `@condo/ui`.
- A borda de cartão (`#E2E8F0`) é decorativa. Campos e botões contornados usam a borda de controle (`#64748B`, ≥ 3:1, WCAG 1.4.11), porque `#E2E8F0` sobre branco dá só 1,2:1.
- O foco aparece só por teclado (`:focus-visible`), com anel azul de 2px e afastamento. Sobre o menu escuro o anel fica azul claro (`#60A5FA`), porque o azul principal ali não chega a 3:1.
- Botões ficam do tamanho do conteúdo. `fullWidth` é opt-in. Regra de uso: no máximo um botão primário por tela ou cartão.

## Custos

- Duas escalas para manter coerentes. Por isso os componentes não fixam px.
- `:has()` exige navegador recente (Chrome 105+, Safari 15.4+, Firefox 121+). Navegador antigo cai na escala do morador: maior, mas funcional.
