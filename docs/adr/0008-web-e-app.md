# ADR-0008 — Sessão no web (BFF) e no app do morador

- Status: aceito
- Data: 2026-11-16

## Decisão

**Web (Next.js App Router) como BFF.**

- O navegador nunca vê token. Access e refresh token ficam em cookies `httpOnly` (`SameSite=Lax`; `Secure` com HTTPS), e o servidor do Next chama a API em nome do usuário.
- Sem CORS na API, nada em `localStorage`. Mutações são _server actions_.
- O `proxy.ts` renova a sessão quando o access token está para vencer. Ele troca cada refresh token **uma vez só**: navegações simultâneas (prefetch) reaproveitam o resultado. Sem isso, a API veria reuso de refresh token e revogaria a família inteira (ADR-0003).
- Equipe e morador compartilham o app, separados por área: `/painel` para quem tem papel acima da unidade, `/morador` para quem só tem papel de unidade.
- O tema vem do `@condo/ui`: cor da gestora ajustada para AA, fonte em 3 tamanhos e alto contraste, por variáveis CSS sem rebuild.

**App do morador (Expo).**

- Tokens no SecureStore (Keychain/Keystore).
- Com sessão guardada e biometria disponível, o app pede digital ou rosto antes de abrir.
- O cliente da API renova uma vez só com chamadas simultâneas, como o web.
- Boletos, avisos e tela inicial têm cache local (AsyncStorage) e aviso "sem conexão".

**Link mágico no celular.**

- O e-mail aponta para o web. No celular, a página pergunta "No aplicativo" (`condominio://entrar/link?token=…`) ou "Neste navegador". O token é de uso único e vale onde for usado primeiro.
- Universal links/App Links exigem domínio com HTTPS e entram quando a homologação tiver domínio.

**2FA no app.** Staff (2FA obrigatório) usa o painel web. O app do morador recusa login de conta que exige 2FA e orienta a entrar pelo site. O modo síndico/conselho e o modo portaria no app ficam para a Fase 3.

## Custos

- A deduplicação do refresh é por processo. Com várias instâncias do web atrás de um balanceador, é preciso sessão fixa (_sticky_) ou uma janela de tolerância na API.
- `Falar com a gestora` leva a uma página informativa; o atendimento por mensagens depende do módulo de chamados (Fase 3).
