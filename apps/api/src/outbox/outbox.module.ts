import { Global, Inject, Module, type OnApplicationShutdown } from '@nestjs/common';
import { ENV, type Env } from '../config/env';
import { OutboxRelay } from './outbox.relay';
import { OutboxHandlers, OutboxService } from './outbox.service';
import { OutboxWorker } from './outbox.worker';
import { createRedis, REDIS, type RedisConnection } from './redis';
import { SystemJobs } from './system-jobs';

/** Outbox transacional + filas (Redis/BullMQ). Infraestrutura comum a todos os módulos. */
@Global()
@Module({
  providers: [
    { provide: REDIS, inject: [ENV], useFactory: (env: Env) => createRedis(env) },
    OutboxHandlers,
    OutboxRelay,
    OutboxService,
    OutboxWorker,
    SystemJobs,
  ],
  exports: [OutboxHandlers, OutboxService, OutboxWorker, SystemJobs],
})
export class OutboxModule implements OnApplicationShutdown {
  constructor(@Inject(REDIS) private readonly redis: RedisConnection) {}

  async onApplicationShutdown(): Promise<void> {
    if (this.redis.status !== 'end' && this.redis.status !== 'wait') await this.redis.quit();
    else this.redis.disconnect();
  }
}
