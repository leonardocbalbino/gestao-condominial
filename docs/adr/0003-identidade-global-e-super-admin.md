# ADR-0003 — Usuário global, pessoa por gestora e super admin da plataforma

- Status: aceito
- Data: 2026-11-15

## Contexto

Uma mesma pessoa pode morar num condomínio da gestora A e ter imóvel num da gestora B. Também é preciso um papel acima das gestoras para onboarding e suporte.

## Decisão

**Identidade**

- `app_user` (login: e-mail, CPF opcional, senha, 2FA) é **global** e não tem `gestora_id`. Guarda o mínimo de dados pessoais.
- `person` (nome, CPF, telefone…) é **por gestora**, com RLS, e aponta para o `app_user`.
- Papéis vêm de `role_assignment` (usuário + papel + escopo + validade). O mesmo usuário pode ter papéis diferentes em gestoras e condomínios diferentes.
- As tabelas globais de identidade (`app_user`, `refresh_session`, `magic_link_token`) não têm RLS de tenant. Só o módulo `identity` as acessa (regra de fronteira entre módulos). Risco aceito: um bug nesse módulo poderia listar e-mails de outras gestoras. Mitigação: os dados pessoais ficam em `person`.

**Autenticação**

- Senha com argon2id (parâmetros OWASP).
- 2FA por TOTP (RFC 6238), implementação própria testada contra os vetores da RFC. Segredo cifrado com AES-256-GCM (`APP_ENCRYPTION_KEY`). Reuso do mesmo código é bloqueado (`totp_last_step`).
- 2FA é **obrigatório** para super admin e para quem tem qualquer papel com `requires_mfa` (gestora, síndico, conselho). Se a pessoa ganha um papel desses com uma sessão sem 2FA, `can()` responde `mfa_required`.
- Link mágico: uso único, 15 minutos, token só como hash no banco. O token vai no fragmento da URL, então não aparece em logs nem em `Referer`. Nesta fase o envio é só por e-mail; WhatsApp e SMS entram como adaptadores da porta `Mailer`.
- Sessão: access JWT HS256 de 15 minutos + refresh opaco rotacionado. Reuso de refresh já trocado revoga a família inteira e é auditado.

**Super admin**

- `app_user.is_platform_admin`.
- Rotas em `/platform/*` com o decorator `@PlatformAdmin()`, conexão separada com o papel de banco `app_platform` e **políticas RLS explícitas** para esse papel. Nunca `BYPASSRLS`.
- O claim do token é reconferido no banco a cada chamada: rebaixar um admin vale na hora.
- Ao criar uma gestora, o super admin cria o usuário administrador, atribui `gestora_admin` e envia o convite por link mágico. O evento abre a cadeia de auditoria da nova gestora.

## Custos

- Duas conexões de pool (`app_user` e `app_platform`).
- O e-mail do convite é enviado depois do commit, mas sem fila. Se o processo cair entre o commit e o envio, o convite se perde. Na Fase 1 isso passa ao outbox com BullMQ.
