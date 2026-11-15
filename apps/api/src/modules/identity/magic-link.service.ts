import { Inject, Injectable, Logger } from '@nestjs/common';
import { and, eq, gt, isNull, sql } from 'drizzle-orm';
import { randomToken, sha256Hex } from '../../common/crypto';
import { ENV, type Env } from '../../config/env';
import { currentContext } from '../../db/request-context';
import { magicLinkToken } from '../../db/schema';
import { MAILER, type Mailer } from './mailer';

const TTL_MS = 15 * 60 * 1000;

@Injectable()
export class MagicLinkService {
  private readonly logger = new Logger(MagicLinkService.name);

  constructor(
    @Inject(MAILER) private readonly mailer: Mailer,
    @Inject(ENV) private readonly env: Env,
  ) {}

  /**
   * Cria um link de uso único e agenda o envio para DEPOIS do commit (o link só
   * existe se a transação for gravada). O token vai no fragmento (#) da URL para
   * não aparecer em logs de servidor nem no header Referer.
   */
  async issue(userId: string, email: string, purpose: 'login' | 'invite'): Promise<void> {
    const ctx = currentContext();
    const token = randomToken();
    await ctx.tx.insert(magicLinkToken).values({
      userId,
      tokenHash: sha256Hex(token),
      expiresAt: new Date(Date.now() + TTL_MS),
    });
    const link = `${this.env.APP_WEB_URL}/entrar/link#token=${token}`;
    const message =
      purpose === 'invite'
        ? {
            subject: 'Seu acesso foi criado',
            text: `Você recebeu acesso à plataforma. Entre por este link (válido por 15 minutos):\n\n${link}`,
          }
        : {
            subject: 'Seu link de acesso',
            text: `Toque no link para entrar (válido por 15 minutos):\n\n${link}\n\nSe não foi você, ignore esta mensagem.`,
          };

    ctx.afterCommit.push(async () => {
      try {
        await this.mailer.send({ to: email, ...message });
      } catch (error) {
        this.logger.error({ err: error, userId }, 'Falha ao enviar link de acesso');
      }
    });
  }

  /** Consome o link (uso único, dentro da validade). Retorna o usuário ou null. */
  async consume(token: string): Promise<string | null> {
    const { tx } = currentContext();
    const [row] = await tx
      .update(magicLinkToken)
      .set({ usedAt: new Date() })
      .where(
        and(
          eq(magicLinkToken.tokenHash, sha256Hex(token)),
          isNull(magicLinkToken.usedAt),
          gt(magicLinkToken.expiresAt, sql`now()`),
        ),
      )
      .returning({ userId: magicLinkToken.userId });
    return row?.userId ?? null;
  }
}
