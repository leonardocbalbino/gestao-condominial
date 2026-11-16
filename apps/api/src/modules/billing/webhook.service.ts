import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
  type OnModuleInit,
} from '@nestjs/common';
import { and, eq, sql } from 'drizzle-orm';
import { todayInBrazil } from '../../common/dates';
import { currentContext } from '../../db/request-context';
import { paymentEvent } from '../../db/schema';
import { OutboxHandlers, OutboxService } from '../../outbox/outbox.service';
import { AuditService } from '../audit/audit.service';
import { ChargeService } from './charge.service';
import { PayableService } from './payable.service';
import { PaymentAccountService } from './payment-account.service';
import { FakePaymentProvider, type FakeWebhookDelivery } from './provider/fake.provider';
import { PAYMENT_PROVIDER, type PaymentProvider } from './provider/payment-provider';

export const PAYMENT_EVENT_TOPIC = 'payment_event.process';

/**
 * Webhooks idempotentes (regra §3.6): o evento bruto é gravado em payment_event com chave
 * única (provider, event_id) ANTES de qualquer processamento; o processamento é assíncrono
 * (outbox → fila). Reenvio do mesmo evento é registrado e descartado.
 */
@Injectable()
export class WebhookService implements OnModuleInit {
  constructor(
    @Inject(PAYMENT_PROVIDER) private readonly provider: PaymentProvider,
    private readonly paymentAccounts: PaymentAccountService,
    private readonly charges: ChargeService,
    private readonly payables: PayableService,
    private readonly outbox: OutboxService,
    private readonly handlers: OutboxHandlers,
    private readonly audit: AuditService,
  ) {}

  onModuleInit(): void {
    this.handlers.register(PAYMENT_EVENT_TOPIC, (payload, meta) =>
      this.process(meta.condominioId ?? '', String(payload['paymentEventId'])),
    );
  }

  async receive(
    providerName: string,
    condominioId: string,
    headers: Record<string, unknown>,
    body: unknown,
  ): Promise<{ recebido: true; duplicado: boolean }> {
    const { tx, gestoraId } = currentContext();
    if (!gestoraId) throw new Error('Webhook exige gestora em contexto');
    if (providerName !== this.provider.name) throw new NotFoundException();
    // Rota com gestora/condomínio forjados não acha a conta (RLS) ou falha no token.
    const creds = await this.paymentAccounts.credentials(condominioId).catch(() => null);
    if (!creds || creds.provider !== providerName) throw new NotFoundException();
    if (!this.provider.verifyWebhook(creds, headers)) throw new UnauthorizedException();

    const event = this.provider.parseWebhook(body);
    if (!event.eventId) throw new BadRequestException('Evento sem id');
    const [inserted] = await tx
      .insert(paymentEvent)
      .values({
        gestoraId,
        condominioId,
        provider: providerName,
        eventId: event.eventId,
        tipo: event.tipo,
        payload: body as Record<string, unknown>,
      })
      .onConflictDoNothing({ target: [paymentEvent.provider, paymentEvent.eventId] })
      .returning({ id: paymentEvent.id });

    if (inserted) {
      await this.outbox.enqueue(PAYMENT_EVENT_TOPIC, { paymentEventId: inserted.id }, condominioId);
    }
    await this.audit.record({
      action: inserted ? 'payment_event.received' : 'payment_event.duplicate',
      resourceType: 'payment_event',
      resourceId: event.eventId,
      after: { provider: providerName, tipo: event.tipo },
    });
    return { recebido: true, duplicado: !inserted };
  }

  /** Processa um evento gravado (handler do outbox). Idempotente. */
  async process(condominioId: string, paymentEventId: string): Promise<void> {
    const { tx } = currentContext();
    const [row] = await tx
      .select()
      .from(paymentEvent)
      .where(and(eq(paymentEvent.id, paymentEventId), eq(paymentEvent.condominioId, condominioId)))
      .for('update');
    if (!row || row.processadoEm) return;

    const event = this.provider.parseWebhook(row.payload);
    let resultado: string;
    switch (event.tipo) {
      case 'charge_paid': {
        const charge = await this.charges.byProviderId(condominioId, event.providerChargeId);
        if (!charge) resultado = 'cobranca_desconhecida';
        else if (charge.status === 'cancelada') resultado = 'cobranca_cancelada_paga';
        else resultado = await this.charges.settle(condominioId, charge, event);
        break;
      }
      case 'charge_cancelled': {
        const charge = await this.charges.byProviderId(condominioId, event.providerChargeId);
        resultado = charge
          ? await this.charges.cancelFromProvider(charge)
          : 'cobranca_desconhecida';
        break;
      }
      case 'bill_paid':
        resultado = await this.payables.confirmPaid(
          condominioId,
          event.providerBillId,
          event.pagoEm,
        );
        break;
      case 'ignorado':
        resultado = `ignorado:${event.original}`;
        break;
    }
    await tx
      .update(paymentEvent)
      .set({ processadoEm: sql`now()`, resultado })
      .where(eq(paymentEvent.id, row.id));
  }

  /**
   * Só no broker fake (dev/testes): simula o pagamento de uma cobrança e devolve o webhook
   * que o broker mandaria, para ser entregue (uma ou mais vezes) na rota de webhook.
   */
  async simulatePayment(
    condominioId: string,
    chargeId: string,
    input: { valorPagoCentavos?: number; pagoEm?: string },
  ): Promise<FakeWebhookDelivery & { path: string }> {
    if (!(this.provider instanceof FakePaymentProvider)) throw new NotFoundException();
    const charge = await this.charges.row(condominioId, chargeId);
    if (!charge.providerChargeId) {
      throw new BadRequestException('A cobrança ainda não foi emitida no broker');
    }
    const creds = await this.paymentAccounts.credentials(condominioId);
    const delivery = this.provider.simulatePayment({
      account: creds,
      providerChargeId: charge.providerChargeId,
      valorPagoCentavos: input.valorPagoCentavos ?? charge.valorCentavos,
      splitCentavos: this.paymentAccounts.platformSplit()?.valorCentavos ?? 0,
      descricao: `cobrança ${charge.id}`,
      pagoEm: input.pagoEm ?? todayInBrazil(),
    });
    await this.audit.record({
      action: 'dev.fake_payment_simulated',
      resourceType: 'charge',
      resourceId: chargeId,
      after: { valorPagoCentavos: delivery.body.charge?.value },
    });
    return { ...delivery, path: (await this.paymentAccounts.get(condominioId)).webhookPath };
  }
}
