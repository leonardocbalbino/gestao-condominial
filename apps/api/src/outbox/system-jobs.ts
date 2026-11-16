import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from '@nestjs/common';
import { Queue, Worker } from 'bullmq';
import { ENV, type Env } from '../config/env';
import { REDIS, type RedisConnection } from './redis';

const SYSTEM_QUEUE = 'system';

interface SystemJob {
  name: string;
  /** Cron (fuso America/Sao_Paulo). */
  pattern: string;
  run: () => Promise<void>;
}

/**
 * Tarefas periódicas do sistema (ex.: conciliação diária). Repetíveis no BullMQ: com
 * várias instâncias da API, cada disparo roda uma vez só.
 */
@Injectable()
export class SystemJobs implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(SystemJobs.name);
  private readonly jobs = new Map<string, SystemJob>();
  private queue: Queue | null = null;
  private worker: Worker | null = null;
  private connection: RedisConnection | null = null;

  constructor(
    @Inject(REDIS) private readonly redis: RedisConnection,
    @Inject(ENV) private readonly env: Env,
  ) {}

  register(job: SystemJob): void {
    this.jobs.set(job.name, job);
  }

  async onApplicationBootstrap(): Promise<void> {
    if (!this.env.WORKERS_ENABLED || this.jobs.size === 0) return;
    this.queue = new Queue(SYSTEM_QUEUE, { connection: this.redis });
    for (const job of this.jobs.values()) {
      await this.queue.upsertJobScheduler(job.name, {
        pattern: job.pattern,
        tz: 'America/Sao_Paulo',
      });
    }
    this.connection = this.redis.duplicate();
    this.worker = new Worker(
      SYSTEM_QUEUE,
      async (job) => {
        const definition = this.jobs.get(job.name);
        if (!definition) throw new Error(`Tarefa desconhecida: ${job.name}`);
        await definition.run();
      },
      { connection: this.connection, concurrency: 1 },
    );
    this.worker.on('failed', (job, error) =>
      this.logger.error({ err: error, job: job?.name }, 'Tarefa periódica falhou'),
    );
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
    await this.queue?.close();
    this.connection?.disconnect();
  }
}
