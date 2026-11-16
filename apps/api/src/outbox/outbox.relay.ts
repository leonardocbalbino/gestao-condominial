import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from '@nestjs/common';
import { Queue } from 'bullmq';
import { sql } from 'drizzle-orm';
import { ENV, type Env } from '../config/env';
import { PLATFORM_DB } from '../db/database.module';
import type { Database } from '../db/request-context';
import { REDIS, type RedisConnection } from './redis';

export const OUTBOX_QUEUE = 'outbox';

export interface OutboxJob {
  outboxId: string;
  gestoraId: string;
}

const POLL_MS = 2_000;

/**
 * Publica na fila os eventos do outbox ainda não publicados. Roda com a conexão
 * app_platform, que só enxerga id/gestora/tópico/estado (grants de coluna, ADR-0007).
 * O jobId é o id do evento: republicar não duplica job enquanto ele existir, e os handlers
 * são idempotentes para o caso de reentrega.
 */
@Injectable()
export class OutboxRelay implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(OutboxRelay.name);
  private readonly queue: Queue<OutboxJob> | null;
  private timer: NodeJS.Timeout | null = null;
  private running: Promise<void> | null = null;
  private again = false;

  constructor(
    @Inject(PLATFORM_DB) private readonly platformDb: Database,
    @Inject(REDIS) redis: RedisConnection,
    @Inject(ENV) private readonly env: Env,
  ) {
    this.queue = env.WORKERS_ENABLED ? new Queue(OUTBOX_QUEUE, { connection: redis }) : null;
  }

  onApplicationBootstrap(): void {
    if (!this.queue) return;
    this.timer = setInterval(() => void this.kick(), POLL_MS);
    void this.kick();
  }

  async onModuleDestroy(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    await this.running;
    await this.queue?.close();
  }

  /** Publica agora (chamado depois de cada COMMIT que gravou eventos). Não lança. */
  kick(): Promise<void> {
    if (!this.queue) return Promise.resolve();
    if (this.running) {
      this.again = true;
      return this.running;
    }
    this.running = this.publishPending()
      .catch((error: unknown) => this.logger.error({ err: error }, 'Falha ao publicar outbox'))
      .finally(() => {
        this.running = null;
        if (this.again) {
          this.again = false;
          void this.kick();
        }
      });
    return this.running;
  }

  private async publishPending(): Promise<void> {
    const queue = this.queue;
    if (!queue) return;
    for (;;) {
      const published = await this.platformDb.transaction(async (tx) => {
        const pending = await tx.execute<{ id: string; gestora_id: string; topic: string }>(sql`
          SELECT id, gestora_id, topic FROM outbox_event
           WHERE published_at IS NULL
           ORDER BY created_at
           LIMIT 100
           FOR UPDATE SKIP LOCKED`);
        for (const row of pending.rows) {
          await queue.add(
            row.topic,
            { outboxId: row.id, gestoraId: row.gestora_id },
            {
              jobId: row.id,
              attempts: 8,
              backoff: { type: 'exponential', delay: 2_000 },
              removeOnComplete: 1_000,
              removeOnFail: 5_000,
            },
          );
        }
        if (pending.rows.length > 0) {
          const ids = sql.join(
            pending.rows.map((r) => sql`${r.id}::uuid`),
            sql`, `,
          );
          await tx.execute(sql`UPDATE outbox_event SET published_at = now() WHERE id IN (${ids})`);
        }
        return pending.rows.length;
      });
      if (published < 100) return;
    }
  }
}
