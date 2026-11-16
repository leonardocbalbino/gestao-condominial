import { Injectable } from '@nestjs/common';
import { currentContext } from '../db/request-context';
import { outboxEvent } from '../db/schema';
import { OutboxRelay } from './outbox.relay';

export interface OutboxMeta {
  outboxId: string;
  gestoraId: string;
  condominioId: string | null;
}

export type OutboxHandler = (payload: Record<string, unknown>, meta: OutboxMeta) => Promise<void>;

/** Registro de handlers por tópico. Cada módulo registra os seus no onModuleInit. */
@Injectable()
export class OutboxHandlers {
  private readonly handlers = new Map<string, OutboxHandler>();

  register(topic: string, handler: OutboxHandler): void {
    if (this.handlers.has(topic)) throw new Error(`Handler duplicado para ${topic}`);
    this.handlers.set(topic, handler);
  }

  get(topic: string): OutboxHandler | undefined {
    return this.handlers.get(topic);
  }
}

/**
 * Transactional outbox: o evento é gravado na MESMA transação da mudança. Se a transação
 * for desfeita, o evento some junto; se for gravada, o relay publica na fila depois do
 * COMMIT. Nunca há efeito externo (broker, e-mail) sem o estado correspondente no banco.
 */
@Injectable()
export class OutboxService {
  constructor(private readonly relay: OutboxRelay) {}

  async enqueue(
    topic: string,
    payload: Record<string, unknown>,
    condominioId: string | null = null,
  ): Promise<void> {
    const ctx = currentContext();
    if (!ctx.gestoraId) throw new Error('Outbox exige gestora em contexto');
    await ctx.tx.insert(outboxEvent).values({
      gestoraId: ctx.gestoraId,
      condominioId,
      topic,
      payload,
    });
    ctx.afterCommit.push(() => this.relay.kick());
  }
}
