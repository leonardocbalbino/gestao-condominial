import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { ExpressInstrumentation } from '@opentelemetry/instrumentation-express';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import { NestInstrumentation } from '@opentelemetry/instrumentation-nestjs-core';
import { PgInstrumentation } from '@opentelemetry/instrumentation-pg';
import { NodeSDK } from '@opentelemetry/sdk-node';

/**
 * Inicia o OpenTelemetry quando OTEL_EXPORTER_OTLP_ENDPOINT está definido.
 * Precisa rodar antes de carregar http/express/pg, por isso é o primeiro import do main.ts.
 */
export function startTracing(): NodeSDK | null {
  if (!process.env.OTEL_EXPORTER_OTLP_ENDPOINT) return null;
  const sdk = new NodeSDK({
    serviceName: process.env.OTEL_SERVICE_NAME ?? 'condo-api',
    traceExporter: new OTLPTraceExporter(),
    instrumentations: [
      new HttpInstrumentation(),
      new ExpressInstrumentation(),
      new NestInstrumentation(),
      // Sem o texto dos parâmetros: podem conter dados pessoais.
      new PgInstrumentation({ enhancedDatabaseReporting: false }),
    ],
  });
  sdk.start();
  return sdk;
}
