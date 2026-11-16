import { Body, Controller, Get, Headers, HttpCode, Param, Post, Query } from '@nestjs/common';
import {
  activatePaymentAccountRequestSchema,
  createBudgetRequestSchema,
  createPayableRequestSchema,
  rateioRequestSchema,
  rejectPayableRequestSchema,
  resolveExceptionRequestSchema,
  type ActivatePaymentAccountRequest,
  type BudgetDto,
  type ChargeDto,
  type CreateBudgetRequest,
  type CreatePayableRequest,
  type MyChargeDto,
  type PayableDto,
  type PaymentAccountDto,
  type RateioPreviewDto,
  type RateioRequest,
  type ReconciliationResultDto,
  type RejectPayableRequest,
  type ResolveExceptionRequest,
  type StatementLineDto,
} from '@condo/contracts';
import { z } from 'zod';
import { RequirePermission, Webhook } from '../../http/access';
import { ZodPipe } from '../../http/zod.pipe';
import { BudgetService } from './budget.service';
import { ChargeService, type InadimplenciaDto } from './charge.service';
import { PayableService } from './payable.service';
import { PaymentAccountService } from './payment-account.service';
import { RateioService } from './rateio.service';
import { ReconciliationService } from './reconciliation.service';
import { WebhookService } from './webhook.service';

const CONDO = { type: 'condominio', param: 'condominioId' } as const;
const UNIT = { type: 'unit', condominioParam: 'condominioId', unitParam: 'unitId' } as const;

const simulatePaymentSchema = z.object({
  valorPagoCentavos: z.number().int().positive().optional(),
  pagoEm: z.iso.date().optional(),
});
const competenciaQuerySchema = z.object({
  competencia: z
    .string()
    .regex(/^\d{4}-\d{2}$/)
    .optional(),
});
const statusQuerySchema = z.object({
  status: z.enum(['conciliada', 'excecao', 'resolvida']).optional(),
});

@Controller('condominios/:condominioId')
export class BillingController {
  constructor(
    private readonly paymentAccounts: PaymentAccountService,
    private readonly budgets: BudgetService,
    private readonly rateio: RateioService,
    private readonly charges: ChargeService,
    private readonly webhooks: WebhookService,
  ) {}

  @Post('billing/account')
  @RequirePermission('condominio:configure', CONDO)
  activate(
    @Param('condominioId') condominioId: string,
    @Body(new ZodPipe(activatePaymentAccountRequestSchema)) body: ActivatePaymentAccountRequest,
  ): Promise<PaymentAccountDto> {
    return this.paymentAccounts.activate(condominioId, body);
  }

  @Get('billing/account')
  @RequirePermission('condominio:read', CONDO)
  account(@Param('condominioId') condominioId: string): Promise<PaymentAccountDto> {
    return this.paymentAccounts.get(condominioId);
  }

  @Get('budgets')
  @RequirePermission('financeiro:read', CONDO)
  listBudgets(@Param('condominioId') condominioId: string): Promise<BudgetDto[]> {
    return this.budgets.list(condominioId);
  }

  @Post('budgets')
  @RequirePermission('orcamento:manage', CONDO)
  createBudget(
    @Param('condominioId') condominioId: string,
    @Body(new ZodPipe(createBudgetRequestSchema)) body: CreateBudgetRequest,
  ): Promise<BudgetDto> {
    return this.budgets.create(condominioId, body);
  }

  @Post('budgets/:budgetId/approve')
  @RequirePermission('orcamento:manage', CONDO)
  approveBudget(
    @Param('condominioId') condominioId: string,
    @Param('budgetId') budgetId: string,
  ): Promise<BudgetDto> {
    return this.budgets.approve(condominioId, budgetId);
  }

  @Get('rateio/preview')
  @RequirePermission('cobranca:manage', CONDO)
  preview(
    @Param('condominioId') condominioId: string,
    @Query(new ZodPipe(rateioRequestSchema)) query: RateioRequest,
  ): Promise<RateioPreviewDto> {
    return this.rateio.preview(condominioId, query);
  }

  @Post('rateio/emit')
  @RequirePermission('cobranca:manage', CONDO)
  emit(
    @Param('condominioId') condominioId: string,
    @Body(new ZodPipe(rateioRequestSchema)) body: RateioRequest,
  ): Promise<{ cobrancas: number }> {
    return this.rateio.emit(condominioId, body);
  }

  @Get('charges')
  @RequirePermission('cobranca:read', CONDO)
  listCharges(
    @Param('condominioId') condominioId: string,
    @Query(new ZodPipe(competenciaQuerySchema)) query: { competencia?: string },
  ): Promise<ChargeDto[]> {
    return this.charges.list(condominioId, query.competencia);
  }

  @Get('charges/inadimplencia')
  @RequirePermission('inadimplencia:read', CONDO)
  inadimplencia(@Param('condominioId') condominioId: string): Promise<InadimplenciaDto[]> {
    return this.charges.inadimplencia(condominioId);
  }

  /** Só com o broker fake: simula o pagamento e devolve o webhook a entregar. */
  @Post('charges/:chargeId/simulate-payment')
  @RequirePermission('cobranca:manage', CONDO)
  simulate(
    @Param('condominioId') condominioId: string,
    @Param('chargeId') chargeId: string,
    @Body(new ZodPipe(simulatePaymentSchema)) body: z.infer<typeof simulatePaymentSchema>,
  ) {
    return this.webhooks.simulatePayment(condominioId, chargeId, body);
  }

  /** Cobranças da unidade: o morador vê só as da própria unidade (escopo da unidade). */
  @Get('units/:unitId/charges')
  @RequirePermission('cobranca:read', UNIT)
  unitCharges(
    @Param('condominioId') condominioId: string,
    @Param('unitId') unitId: string,
  ): Promise<MyChargeDto[]> {
    return this.charges.ofUnit(condominioId, unitId);
  }
}

@Controller('condominios/:condominioId/payables')
export class PayableController {
  constructor(private readonly payables: PayableService) {}

  @Get()
  @RequirePermission('financeiro:read', CONDO)
  list(@Param('condominioId') condominioId: string): Promise<PayableDto[]> {
    return this.payables.list(condominioId);
  }

  @Post()
  @RequirePermission('pagamento:request', CONDO)
  create(
    @Param('condominioId') condominioId: string,
    @Body(new ZodPipe(createPayableRequestSchema)) body: CreatePayableRequest,
  ): Promise<PayableDto> {
    return this.payables.create(condominioId, body);
  }

  @Post(':payableId/approve')
  @RequirePermission('pagamento:approve', CONDO)
  approve(
    @Param('condominioId') condominioId: string,
    @Param('payableId') payableId: string,
  ): Promise<PayableDto> {
    return this.payables.approve(condominioId, payableId);
  }

  @Post(':payableId/approve-second')
  @RequirePermission('pagamento:approve_second', CONDO)
  approveSecond(
    @Param('condominioId') condominioId: string,
    @Param('payableId') payableId: string,
  ): Promise<PayableDto> {
    return this.payables.approveSecond(condominioId, payableId);
  }

  @Post(':payableId/reject')
  @RequirePermission('pagamento:approve', CONDO)
  reject(
    @Param('condominioId') condominioId: string,
    @Param('payableId') payableId: string,
    @Body(new ZodPipe(rejectPayableRequestSchema)) body: RejectPayableRequest,
  ): Promise<PayableDto> {
    return this.payables.reject(condominioId, payableId, body, 'primeira');
  }

  @Post(':payableId/reject-second')
  @RequirePermission('pagamento:approve_second', CONDO)
  rejectSecond(
    @Param('condominioId') condominioId: string,
    @Param('payableId') payableId: string,
    @Body(new ZodPipe(rejectPayableRequestSchema)) body: RejectPayableRequest,
  ): Promise<PayableDto> {
    return this.payables.reject(condominioId, payableId, body, 'segunda');
  }

  @Post(':payableId/pay')
  @RequirePermission('pagamento:request', CONDO)
  pay(
    @Param('condominioId') condominioId: string,
    @Param('payableId') payableId: string,
  ): Promise<PayableDto> {
    return this.payables.requestPayment(condominioId, payableId);
  }
}

@Controller('condominios/:condominioId/reconciliation')
export class ReconciliationController {
  constructor(private readonly reconciliation: ReconciliationService) {}

  @Post('run')
  @RequirePermission('conciliacao:manage', CONDO)
  run(@Param('condominioId') condominioId: string): Promise<ReconciliationResultDto> {
    return this.reconciliation.run(condominioId);
  }

  @Get('lines')
  @RequirePermission('financeiro:read', CONDO)
  lines(
    @Param('condominioId') condominioId: string,
    @Query(new ZodPipe(statusQuerySchema)) query: z.infer<typeof statusQuerySchema>,
  ): Promise<StatementLineDto[]> {
    return this.reconciliation.list(condominioId, query.status);
  }

  @Post('lines/:lineId/resolve')
  @RequirePermission('conciliacao:manage', CONDO)
  resolve(
    @Param('condominioId') condominioId: string,
    @Param('lineId') lineId: string,
    @Body(new ZodPipe(resolveExceptionRequestSchema)) body: ResolveExceptionRequest,
  ): Promise<StatementLineDto> {
    return this.reconciliation.resolve(condominioId, lineId, body);
  }
}

/** Webhooks do broker: um endereço por condomínio, autenticado pelo token da subconta. */
@Controller('webhooks/:provider/:gestoraId/:condominioId')
export class WebhookController {
  constructor(private readonly webhooks: WebhookService) {}

  @Post()
  @HttpCode(200)
  @Webhook('gestoraId')
  receive(
    @Param('provider') provider: string,
    @Param('condominioId') condominioId: string,
    @Headers() headers: Record<string, unknown>,
    @Body() body: unknown,
  ): Promise<{ recebido: true; duplicado: boolean }> {
    return this.webhooks.receive(provider, condominioId, headers, body);
  }
}
