import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { totpCode } from '../src/common/totp';
import { createTestApp, nextTotp, type TestApp } from './support/app';
import {
  assignRole,
  closeTestPools,
  countAudit,
  createGestora,
  createUser,
  testPools,
  type TestUser,
} from './support/db';

let t: TestApp;
let gestoraId: string;

beforeAll(async () => {
  t = await createTestApp();
  gestoraId = await createGestora();
});

afterAll(async () => {
  await t.close();
  await closeTestPools();
});

describe('login com 2FA (staff)', () => {
  let sindico: TestUser;
  let secret: string;

  beforeAll(async () => {
    sindico = await createUser({ prefix: 'sindico' });
    await assignRole(sindico.id, gestoraId, 'sindico');
  });

  it('primeiro login exige configurar o 2FA; o código confirma e emite a sessão', async () => {
    const step1 = await t
      .http()
      .post('/auth/login')
      .send({ email: sindico.email, password: sindico.password });
    expect(step1.status).toBe(200);
    expect(step1.body).toEqual({ status: 'mfa_enrollment_required', mfaToken: expect.any(String) });
    expect(step1.body.accessToken).toBeUndefined();

    const enroll = await t.http().post('/auth/mfa/enroll').send({ mfaToken: step1.body.mfaToken });
    expect(enroll.status).toBe(200);
    expect(enroll.body.otpauthUrl).toMatch(/^otpauth:\/\/totp\//);
    secret = enroll.body.secret;

    // Recarregar a tela de cadastro reapresenta o mesmo segredo (o QR já lido continua valendo).
    const again = await t.http().post('/auth/mfa/enroll').send({ mfaToken: step1.body.mfaToken });
    expect(again.status).toBe(200);
    expect(again.body.secret).toBe(secret);

    const verify = await t
      .http()
      .post('/auth/mfa/verify')
      .send({ mfaToken: step1.body.mfaToken, code: nextTotp(secret) });
    expect(verify.status).toBe(200);
    expect(verify.body).toMatchObject({
      status: 'authenticated',
      accessToken: expect.any(String),
      refreshToken: expect.any(String),
    });

    const { rows } = await testPools().admin.query(
      'SELECT totp_enabled_at, totp_secret_enc FROM app_user WHERE id = $1',
      [sindico.id],
    );
    expect(rows[0].totp_enabled_at).not.toBeNull();
    expect(rows[0].totp_secret_enc).not.toContain(secret);
  });

  it('logins seguintes pedem o código; código errado ou reutilizado é recusado', async () => {
    const step1 = await t
      .http()
      .post('/auth/login')
      .send({ email: sindico.email, password: sindico.password });
    expect(step1.body.status).toBe('mfa_required');

    const wrong = await t
      .http()
      .post('/auth/mfa/verify')
      .send({ mfaToken: step1.body.mfaToken, code: '000000' });
    expect(wrong.status).toBe(401);

    const { rows } = await testPools().admin.query<{ totp_last_step: string }>(
      'SELECT totp_last_step FROM app_user WHERE id = $1',
      [sindico.id],
    );
    const usedCode = totpCode(secret, Number(rows[0]?.totp_last_step) * 30_000);
    const replay = await t
      .http()
      .post('/auth/mfa/verify')
      .send({ mfaToken: step1.body.mfaToken, code: usedCode });
    expect(replay.status).toBe(401);

    const ok = await t
      .http()
      .post('/auth/mfa/verify')
      .send({ mfaToken: step1.body.mfaToken, code: nextTotp(secret) });
    expect(ok.status).toBe(200);
    expect(ok.body.status).toBe('authenticated');
  });

  it('o token de 2FA não serve como access token', async () => {
    const step1 = await t
      .http()
      .post('/auth/login')
      .send({ email: sindico.email, password: sindico.password });
    const me = await t.http().get('/me').set('Authorization', `Bearer ${step1.body.mfaToken}`);
    expect(me.status).toBe(401);
  });

  it('não permite reconfigurar o 2FA com um token de verificação', async () => {
    const step1 = await t
      .http()
      .post('/auth/login')
      .send({ email: sindico.email, password: sindico.password });
    const enroll = await t.http().post('/auth/mfa/enroll').send({ mfaToken: step1.body.mfaToken });
    expect(enroll.status).toBe(401);
  });
});

describe('login sem 2FA (morador)', () => {
  let morador: TestUser;

  beforeAll(async () => {
    morador = await createUser({ prefix: 'morador' });
    await assignRole(morador.id, gestoraId, 'morador');
  });

  it('senha correta emite sessão direto', async () => {
    const res = await t
      .http()
      .post('/auth/login')
      .send({ email: morador.email, password: morador.password });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('authenticated');

    const me = await t.http().get('/me').set('Authorization', `Bearer ${res.body.accessToken}`);
    expect(me.status).toBe(200);
    expect(me.body).toMatchObject({
      email: morador.email,
      mfaEnabled: false,
      gestoras: [{ id: gestoraId, roles: [{ key: 'morador' }] }],
    });
  });

  it('senha errada e e-mail inexistente dão a mesma resposta', async () => {
    const wrong = await t
      .http()
      .post('/auth/login')
      .send({ email: morador.email, password: 'errada' });
    const unknown = await t
      .http()
      .post('/auth/login')
      .send({ email: 'ninguem@teste.local', password: 'errada' });
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrong.body.message).toBe(unknown.body.message);
  });

  it('link mágico: envia, entra uma vez, e não pode ser reutilizado', async () => {
    const req = await t
      .http()
      .post('/auth/magic-link')
      .send({ email: morador.email.toUpperCase() });
    expect(req.status).toBe(202);
    const token = t.mailer.lastTokenFor(morador.email);
    expect(token).toBeDefined();

    const first = await t.http().post('/auth/magic-link/consume').send({ token });
    expect(first.status).toBe(200);
    expect(first.body.status).toBe('authenticated');

    const second = await t.http().post('/auth/magic-link/consume').send({ token });
    expect(second.status).toBe(401);
  });

  it('link mágico para e-mail inexistente responde igual e não envia nada', async () => {
    const before = t.mailer.sent.length;
    const res = await t.http().post('/auth/magic-link').send({ email: 'nao-existe@teste.local' });
    expect(res.status).toBe(202);
    expect(t.mailer.sent.length).toBe(before);
  });

  it('refresh rotaciona; reuso do token antigo revoga a família inteira', async () => {
    const login = await t
      .http()
      .post('/auth/login')
      .send({ email: morador.email, password: morador.password });
    const original = login.body.refreshToken as string;

    const rotated = await t.http().post('/auth/refresh').send({ refreshToken: original });
    expect(rotated.status).toBe(200);
    expect(rotated.body.refreshToken).not.toBe(original);

    const reuseAuditsBefore = await countAudit({ action: 'auth.session.reuse_detected' });
    const reuse = await t.http().post('/auth/refresh').send({ refreshToken: original });
    expect(reuse.status).toBe(401);
    // Auditado apesar do 401 (CommitThenFail).
    expect(await countAudit({ action: 'auth.session.reuse_detected' })).toBe(reuseAuditsBefore + 1);

    // A revogação também foi gravada: o token novo da mesma família morreu.
    const afterReuse = await t
      .http()
      .post('/auth/refresh')
      .send({ refreshToken: rotated.body.refreshToken });
    expect(afterReuse.status).toBe(401);
  });

  it('logout revoga a sessão', async () => {
    const login = await t
      .http()
      .post('/auth/login')
      .send({ email: morador.email, password: morador.password });
    const out = await t.http().post('/auth/logout').send({ refreshToken: login.body.refreshToken });
    expect(out.status).toBe(204);
    const refresh = await t
      .http()
      .post('/auth/refresh')
      .send({ refreshToken: login.body.refreshToken });
    expect(refresh.status).toBe(401);
  });
});

describe('rotas protegidas', () => {
  it('sem token: 401', async () => {
    expect((await t.http().get('/me')).status).toBe(401);
  });

  it('token adulterado: 401', async () => {
    const res = await t
      .http()
      .get('/me')
      .set('Authorization', 'Bearer eyJhbGciOiJub25lIn0.eyJzdWIiOiJ4In0.');
    expect(res.status).toBe(401);
  });

  it('entrada inválida: 400 com os campos', async () => {
    const res = await t.http().post('/auth/login').send({ email: 'nao-e-email' });
    expect(res.status).toBe(400);
    expect(res.body.issues.map((i: { path: string }) => i.path)).toEqual(
      expect.arrayContaining(['email', 'password']),
    );
  });
});
