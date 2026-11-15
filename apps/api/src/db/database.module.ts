import { Global, Inject, Module, type OnApplicationShutdown } from '@nestjs/common';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { ENV, type Env } from '../config/env';
import type { Database } from './request-context';
import { schema } from './schema';

/** Conexão como app_user (sujeita a RLS). Usada por toda a API. */
export const APP_DB = Symbol('APP_DB');
/** Conexão como app_platform. Usada apenas pelo caminho /platform. */
export const PLATFORM_DB = Symbol('PLATFORM_DB');
const POOLS = Symbol('POOLS');

@Global()
@Module({
  providers: [
    {
      provide: POOLS,
      inject: [ENV],
      useFactory: (env: Env) => ({
        app: new Pool({ connectionString: env.DATABASE_URL, max: 20 }),
        platform: new Pool({ connectionString: env.DATABASE_PLATFORM_URL, max: 5 }),
      }),
    },
    {
      provide: APP_DB,
      inject: [POOLS],
      useFactory: (pools: { app: Pool }): Database => drizzle(pools.app, { schema }),
    },
    {
      provide: PLATFORM_DB,
      inject: [POOLS],
      useFactory: (pools: { platform: Pool }): Database => drizzle(pools.platform, { schema }),
    },
  ],
  exports: [APP_DB, PLATFORM_DB],
})
export class DatabaseModule implements OnApplicationShutdown {
  constructor(@Inject(POOLS) private readonly pools: { app: Pool; platform: Pool }) {}

  async onApplicationShutdown(): Promise<void> {
    await Promise.all([this.pools.app.end(), this.pools.platform.end()]);
  }
}
