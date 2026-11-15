import { loadDotEnvFile } from './config/env';
import { startTracing } from './observability/tracing';

loadDotEnvFile();
const tracing = startTracing();

async function bootstrap(): Promise<void> {
  // Imports tardios: o OpenTelemetry precisa instrumentar os módulos antes de serem carregados.
  await import('reflect-metadata');
  const { NestFactory } = await import('@nestjs/core');
  const { Logger } = await import('nestjs-pino');
  const { AppModule } = await import('./app.module');
  const { ENV } = await import('./config/env');

  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));
  app.enableShutdownHooks();
  const env = app.get<import('./config/env').Env>(ENV);
  if (env.TRUST_PROXY) app.getHttpAdapter().getInstance().set('trust proxy', 1);
  await app.listen(env.PORT);
}

bootstrap().catch(async (error: unknown) => {
  process.stderr.write(`Falha ao iniciar: ${String(error)}\n`);
  await tracing?.shutdown();
  process.exit(1);
});
