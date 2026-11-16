import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from '@nestjs/common';
import { Worker, type Job } from 'bullmq';
import { eq, sql } from 'drizzle-orm';
import { ENV, type Env } from '../config/env';
import { APP_DB } from '../db/database.module';
import { currentContext, runInContext, type Database } from '../db/request-context';
import { outboxEvent } from '../db/schema';
import { OUTBOX_QUEUE, type OutboxJob } from './outbox.relay';
import { OutboxHandlers } from './outbox.service';
import { REDIS, type RedisConnection } from './redis';

/**
 * Consome a fila do outbox. Cada job roda numa transação com o contexto RLS da gestora
 * do evento (app_user, como uma requisição), sem usuário: a auditoria registra o sistema.
 * Falha → retry com backoff (BullMQ); tentativas e último erro ficam no evento.
 */
@Injectable()
export class OutboxWorker implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(OutboxWorker.name);
  private worker: Worker<OutboxJob> | null = null;
  private connection: RedisConnection | null = null;

  constructor(
    @Inject(APP_DB) private readonly appDb: Database,
    @Inject(REDIS) private readonly redis: RedisConnection,
    @Inject(ENV) private readonly env: Env,
    private readonly handlers: OutboxHandlers,
  ) {}

  onApplicationBootstrap(): void {
    if (!this.env.WORKERS_ENABLED) return;
    this.connection = this.redis.duplicate();
    this.worker = new Worker<OutboxJob>(OUTBOX_QUEUE, (job) => this.process(job), {
      connection: this.connection,
      concurrency: 4,
    });
    this.worker.on('failed', (job, error) =>
      this.logger.warn({ err: error, jobId: job?.id, topic: job?.name }, 'Job do outbox falhou'),
    );
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
    this.connection?.disconnect();
  }

  /** Processa um evento. Público para testes e reprocessamento manual. */
  async process(job: Pick<Job<OutboxJob>, 'id' | 'data'>): Promise<void> {
    const { outboxId, gestoraId } = job.data;
    const context = {
      gestoraId,
      userId: null,
      mfa: false,
      ip: null,
      requestId: `job:${String(job.id)}`,
    };
    try {
      await runInContext(this.appDb, context, async () => {
        const { tx } = currentContext();
        const [event] = await tx
          .select()
          .from(outboxEvent)
          .where(eq(outboxEvent.id, outboxId))
          .for('update');
        if (!event || event.processedAt) return; // já processado: reentrega é inofensiva
        const handler = this.handlers.get(event.topic);
        if (!handler) throw new Error(`Sem handler para o tópico ${event.topic}`);
        await handler(event.payload, {
          outboxId,
          gestoraId,
          condominioId: event.condominioId,
        });
        await tx
          .update(outboxEvent)
          .set({
            processedAt: sql`now()`,
            attempts: sql`${outboxEvent.attempts} + 1`,
            lastError: null,
          })
          .where(eq(outboxEvent.id, outboxId));
      });
    } catch (error) {
      await runInContext(this.appDb, context, async () => {
        await currentContext()
          .tx.update(outboxEvent)
          .set({
            attempts: sql`${outboxEvent.attempts} + 1`,
            lastError: (error as Error).message.slice(0, 1000),
          })
          .where(eq(outboxEvent.id, outboxId));
      });
      throw error;
    }
  }
}
