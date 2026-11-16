import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  type OnModuleInit,
} from '@nestjs/common';
import type { CreatePayableRequest, PayableDto, RejectPayableRequest } from '@condo/contracts';
import { and, desc, eq } from 'drizzle-orm';
import { todayInBrazil } from '../../common/dates';
import { currentContext } from '../../db/request-context';
import { payable, PAYABLE_STATUS } from '../../db/schema';
import { OutboxHandlers, OutboxService } from '../../outbox/outbox.service';
import { AuditService } from '../audit/audit.service';
import { AttachmentService } from '../documents/attachment.service';
import { AccountService } from '../ledger/account.service';
import { JournalService } from '../ledger/journal.service';
import { CondominioService } from '../org/condominio.service';
import { PaymentAccountService } from './payment-account.service';
import { PAYMENT_PROVIDER, type PaymentProvider } from './provider/payment-provider';

type PayableRow = typeof payable.$inferSelect;
type PayableStatus = (typeof PAYABLE_STATUS)[number];

export const PAYABLE_PAY_TOPIC = 'payable.pay';

const toDto = (row: PayableRow): PayableDto => ({
  id: row.id,
  fornecedor: row.fornecedor,
  descricao: row.descricao,
  accountId: row.accountId,
  valorCentavos: row.valorCentavos,
  vencimento: row.vencimento,
  status: row.status,
  requerSegundaAprovacao: row.requerSegundaAprovacao,
  comprovanteId: row.comprovanteId,
  aprovadoEm: row.aprovadoEm?.toISOString() ?? null,
  segundaAprovacaoEm: row.segundaAprovacaoEm?.toISOString() ?? null,
  motivoRejeicao: row.motivoRejeicao,
  pagoEm: row.pagoEm,
});

/**
 * Contas a pagar (§5): só com comprovante anexado e aprovação do síndico; acima do limite
 * configurado, segunda assinatura de um conselheiro. Quem cadastra não aprova, e as duas
 * assinaturas são de pessoas diferentes (também garantido por CHECK no banco).
 */
@Injectable()
export class PayableService implements OnModuleInit {
  constructor(
    @Inject(PAYMENT_PROVIDER) private readonly provider: PaymentProvider,
    private readonly paymentAccounts: PaymentAccountService,
    private readonly accounts: AccountService,
    private readonly attachments: AttachmentService,
    private readonly condominios: CondominioService,
    private readonly journal: JournalService,
    private readonly outbox: OutboxService,
    private readonly handlers: OutboxHandlers,
    private readonly audit: AuditService,
  ) {}

  onModuleInit(): void {
    this.handlers.register(PAYABLE_PAY_TOPIC, (payload, meta) =>
      this.executePayment(meta.condominioId ?? '', String(payload['payableId'])),
    );
  }

  async list(condominioId: string): Promise<PayableDto[]> {
    const { tx } = currentContext();
    const rows = await tx
      .select()
      .from(payable)
      .where(eq(payable.condominioId, condominioId))
      .orderBy(desc(payable.createdAt));
    return rows.map(toDto);
  }

  async create(condominioId: string, input: CreatePayableRequest): Promise<PayableDto> {
    const { tx, gestoraId, userId } = currentContext();
    if (!gestoraId) throw new Error('Conta a pagar exige gestora em contexto');
    const [acc] = await this.accounts.getMany(condominioId, [input.accountId]);
    if (!acc || acc.natureza !== 'despesa' || !acc.analitica) {
      throw new BadRequestException('Escolha uma conta de despesa analítica do condomínio');
    }
    await this.attachments.get(condominioId, input.comprovanteId);
    const config = await this.condominios.getConfig(condominioId);

    const [row] = await tx
      .insert(payable)
      .values({
        gestoraId,
        condominioId,
        fornecedor: input.fornecedor,
        fornecedorDocumento: input.fornecedorDocumento ?? null,
        descricao: input.descricao,
        accountId: input.accountId,
        valorCentavos: input.valorCentavos,
        vencimento: input.vencimento,
        linhaDigitavel: input.linhaDigitavel ?? null,
        comprovanteId: input.comprovanteId,
        requerSegundaAprovacao:
          input.valorCentavos > config.pagamentos.limiteSegundaAprovacaoCentavos,
        createdBy: userId,
      })
      .returning();
    if (!row) throw new Error('Falha ao cadastrar conta a pagar');
    const dto = toDto(row);
    await this.audit.record({
      action: 'payable.created',
      resourceType: 'payable',
      resourceId: dto.id,
      after: dto,
    });
    return dto;
  }

  /** Aprovação do síndico. */
  async approve(condominioId: string, payableId: string): Promise<PayableDto> {
    const row = await this.get(condominioId, payableId);
    const { userId } = currentContext();
    this.expectStatus(row, 'aguardando_aprovacao');
    if (row.createdBy === userId) throw new ForbiddenException('Quem cadastrou a conta não aprova');
    return this.transition(row, 'payable.approved', {
      status: row.requerSegundaAprovacao ? 'aguardando_segunda_aprovacao' : 'aprovada',
      aprovadoPor: userId,
      aprovadoEm: new Date(),
    });
  }

  /** Segunda assinatura (conselheiro), acima do limite configurado. */
  async approveSecond(condominioId: string, payableId: string): Promise<PayableDto> {
    const row = await this.get(condominioId, payableId);
    const { userId } = currentContext();
    this.expectStatus(row, 'aguardando_segunda_aprovacao');
    if (row.aprovadoPor === userId || row.createdBy === userId) {
      throw new ForbiddenException('A segunda assinatura precisa ser de outra pessoa');
    }
    return this.transition(row, 'payable.second_approved', {
      status: 'aprovada',
      segundaAprovacaoPor: userId,
      segundaAprovacaoEm: new Date(),
    });
  }

  /** Recusa por quem aprova a etapa atual: síndico (1ª) ou conselheiro (2ª assinatura). */
  async reject(
    condominioId: string,
    payableId: string,
    input: RejectPayableRequest,
    etapa: 'primeira' | 'segunda',
  ): Promise<PayableDto> {
    const row = await this.get(condominioId, payableId);
    this.expectStatus(
      row,
      etapa === 'primeira' ? 'aguardando_aprovacao' : 'aguardando_segunda_aprovacao',
    );
    return this.transition(row, 'payable.rejected', {
      status: 'rejeitada',
      rejeitadoPor: currentContext().userId,
      motivoRejeicao: input.motivo,
    });
  }

  /** Pede o pagamento ao broker (assíncrono, via outbox). Só depois de aprovada. */
  async requestPayment(condominioId: string, payableId: string): Promise<PayableDto> {
    const row = await this.get(condominioId, payableId);
    this.expectStatus(row, 'aprovada');
    if (this.provider.name !== 'fake' && !row.linhaDigitavel) {
      throw new BadRequestException('Cadastre a linha digitável para pagar pelo broker');
    }
    await this.paymentAccounts.get(condominioId);
    const dto = await this.transition(row, 'payable.payment_requested', {
      status: 'pagamento_solicitado',
    });
    await this.outbox.enqueue(PAYABLE_PAY_TOPIC, { payableId }, condominioId);
    return dto;
  }

  /** Handler do outbox: paga no broker; se confirmado na hora, já lança a despesa. */
  async executePayment(condominioId: string, payableId: string): Promise<void> {
    const row = await this.get(condominioId, payableId);
    if (row.status !== 'pagamento_solicitado' || row.providerPaymentId) return;
    const creds = await this.paymentAccounts.credentials(condominioId);
    const result = await this.provider.payBill(creds, {
      externalReference: row.id,
      linhaDigitavel: row.linhaDigitavel,
      valorCentavos: row.valorCentavos,
      data: todayInBrazil(),
      descricao: `${row.fornecedor} — ${row.descricao}`.slice(0, 200),
    });
    const { tx } = currentContext();
    await tx.update(payable).set({ providerPaymentId: result.id }).where(eq(payable.id, row.id));
    if (result.status === 'pago' && result.pagoEm) {
      await this.finalize({ ...row, providerPaymentId: result.id }, result.pagoEm);
    }
  }

  /** Confirmação do pagamento vinda do webhook do broker. Idempotente. */
  async confirmPaid(condominioId: string, providerBillId: string, pagoEm: string): Promise<string> {
    const { tx } = currentContext();
    const [row] = await tx
      .select()
      .from(payable)
      .where(
        and(eq(payable.condominioId, condominioId), eq(payable.providerPaymentId, providerBillId)),
      );
    if (!row) return 'conta_desconhecida';
    if (row.status === 'paga') return 'ja_paga';
    await this.finalize(row, pagoEm);
    return 'paga';
  }

  /** Despesa no razão: débito na conta de despesa, crédito no banco, com o comprovante. */
  private async finalize(row: PayableRow, pagoEm: string): Promise<void> {
    if (!row.providerPaymentId) throw new Error('Pagamento sem id no broker');
    const banco = await this.accounts.byPapel(row.condominioId, 'banco');
    await this.journal.postOnce(row.condominioId, {
      origem: 'pagamento',
      origemRef: row.providerPaymentId,
      dataCaixa: pagoEm,
      dataCompetencia: row.vencimento,
      historico: `${row.fornecedor} — ${row.descricao}`.slice(0, 500),
      comprovanteId: row.comprovanteId,
      linhas: [
        { accountId: row.accountId, valorCentavos: row.valorCentavos },
        { accountId: banco.id, valorCentavos: -row.valorCentavos },
      ],
    });
    const { tx } = currentContext();
    await tx.update(payable).set({ status: 'paga', pagoEm }).where(eq(payable.id, row.id));
    await this.audit.record({
      action: 'payable.paid',
      resourceType: 'payable',
      resourceId: row.id,
      after: { pagoEm, providerPaymentId: row.providerPaymentId },
    });
  }

  private async get(condominioId: string, payableId: string): Promise<PayableRow> {
    const { tx } = currentContext();
    const [row] = await tx
      .select()
      .from(payable)
      .where(and(eq(payable.id, payableId), eq(payable.condominioId, condominioId)))
      .for('update');
    if (!row) throw new NotFoundException('Conta a pagar não encontrada');
    return row;
  }

  private expectStatus(row: PayableRow, status: PayableStatus): void {
    if (row.status !== status)
      throw new ConflictException(`A conta está ${row.status.replace(/_/g, ' ')}`);
  }

  private async transition(
    row: PayableRow,
    action: string,
    changes: Partial<typeof payable.$inferInsert>,
  ): Promise<PayableDto> {
    const { tx } = currentContext();
    const [updated] = await tx
      .update(payable)
      .set(changes)
      .where(eq(payable.id, row.id))
      .returning();
    if (!updated) throw new Error('Falha ao atualizar conta a pagar');
    const dto = toDto(updated);
    await this.audit.record({
      action,
      resourceType: 'payable',
      resourceId: row.id,
      before: { status: row.status },
      after: dto,
    });
    return dto;
  }
}
