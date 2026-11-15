import { randomUUID } from 'node:crypto';
import { Module } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import { ConfigModule } from './config/config.module';
import { ENV, type Env } from './config/env';
import { DatabaseModule } from './db/database.module';
import { AuthGuard } from './http/auth.guard';
import { RequestPipelineInterceptor } from './http/request-pipeline.interceptor';
import { AuditModule } from './modules/audit/audit.module';
import { IdentityModule } from './modules/identity/identity.module';
import { OrgModule } from './modules/org/org.module';
import { PlatformModule } from './modules/platform/platform.module';

const REQUEST_ID = /^[\w-]{8,64}$/;

@Module({
  imports: [
    ConfigModule,
    LoggerModule.forRootAsync({
      inject: [ENV],
      useFactory: (env: Env) => ({
        pinoHttp: {
          level: env.LOG_LEVEL,
          genReqId: (req) => {
            const incoming = req.headers['x-request-id'];
            return typeof incoming === 'string' && REQUEST_ID.test(incoming)
              ? incoming
              : randomUUID();
          },
          // Nunca logar credenciais ou dados pessoais (LGPD).
          redact: {
            paths: [
              'req.headers.authorization',
              'req.headers.cookie',
              '*.password',
              '*.cpf',
              '*.token',
              '*.refreshToken',
              '*.mfaToken',
              '*.secret',
            ],
            censor: '[omitido]',
          },
          ...(env.NODE_ENV === 'development' ? { transport: { target: 'pino-pretty' } } : {}),
        },
      }),
    }),
    ThrottlerModule.forRootAsync({
      inject: [ENV],
      useFactory: (env: Env) => [{ ttl: 60_000, limit: env.AUTH_RATE_LIMIT_PER_MINUTE }],
    }),
    DatabaseModule,
    AuditModule,
    OrgModule,
    IdentityModule,
    PlatformModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_INTERCEPTOR, useClass: RequestPipelineInterceptor },
  ],
})
export class AppModule {}
