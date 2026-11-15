import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { totpCode, totpStep, TOTP_STEP_SECONDS } from '../../src/common/totp';
import { AppModule } from '../../src/app.module';
import { MAILER, type MailMessage, type Mailer } from '../../src/modules/identity/mailer';
import type { TestUser } from './db';

export class FakeMailer implements Mailer {
  readonly sent: MailMessage[] = [];

  send(message: MailMessage): Promise<void> {
    this.sent.push(message);
    return Promise.resolve();
  }

  /** Token do último link enviado para o e-mail. */
  lastTokenFor(email: string): string | undefined {
    const message = [...this.sent].reverse().find((m) => m.to === email);
    return message?.text.match(/#token=([\w-]+)/)?.[1];
  }
}

export interface TestApp {
  app: INestApplication;
  http: () => ReturnType<typeof request>;
  mailer: FakeMailer;
  close: () => Promise<void>;
}

export async function createTestApp(extraModules: unknown[] = []): Promise<TestApp> {
  const mailer = new FakeMailer();
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule, ...(extraModules as never[])],
  })
    .overrideProvider(MAILER)
    .useValue(mailer)
    .compile();
  const app = moduleRef.createNestApplication({ logger: false });
  await app.init();
  return {
    app,
    http: () => request(app.getHttpServer()),
    mailer,
    close: () => app.close(),
  };
}

/**
 * Gera códigos TOTP em passos crescentes por segredo: o servidor recusa reuso de um
 * passo, e a janela aceita ±1 passo, então cada usuário pode logar 2x por janela.
 */
const lastStepBySecret = new Map<string, number>();
export function nextTotp(secret: string): string {
  const now = Date.now();
  const step = Math.max(totpStep(now), (lastStepBySecret.get(secret) ?? -1) + 1);
  if (step > totpStep(now) + 1)
    throw new Error('Mais de dois logins TOTP na mesma janela para este usuário');
  lastStepBySecret.set(secret, step);
  return totpCode(secret, step * TOTP_STEP_SECONDS * 1000);
}

/** Login completo (senha + TOTP se exigido). Devolve o access token. */
export async function login(t: TestApp, user: TestUser): Promise<string> {
  const first = await t
    .http()
    .post('/auth/login')
    .send({ email: user.email, password: user.password });
  if (first.status !== 200)
    throw new Error(`login falhou: ${first.status} ${JSON.stringify(first.body)}`);
  if (first.body.status === 'authenticated') return first.body.accessToken as string;
  if (first.body.status !== 'mfa_required' || !user.totpSecret) {
    throw new Error(`login inesperado: ${JSON.stringify(first.body)}`);
  }
  const second = await t
    .http()
    .post('/auth/mfa/verify')
    .send({ mfaToken: first.body.mfaToken, code: nextTotp(user.totpSecret) });
  if (second.status !== 200)
    throw new Error(`2FA falhou: ${second.status} ${JSON.stringify(second.body)}`);
  return second.body.accessToken as string;
}
