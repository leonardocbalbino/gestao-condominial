import { Module } from '@nestjs/common';
import { ENV, type Env } from '../../config/env';
import { DocumentsModule } from '../documents/documents.module';
import { IdentityModule } from '../identity/identity.module';
import { LedgerModule } from '../ledger/ledger.module';
import { OrgModule } from '../org/org.module';
import {
  BillingController,
  PayableController,
  ReconciliationController,
  WebhookController,
} from './billing.controller';
import { BudgetService } from './budget.service';
import { ChargeService } from './charge.service';
import { PayableService } from './payable.service';
import { PaymentAccountService } from './payment-account.service';
import { AsaasPaymentProvider } from './provider/asaas.provider';
import { FakePaymentProvider } from './provider/fake.provider';
import { PAYMENT_PROVIDER, type PaymentProvider } from './provider/payment-provider';
import { RateioService } from './rateio.service';
import { ReconciliationService } from './reconciliation.service';
import { WebhookService } from './webhook.service';

/**
 * Dono de payment_account, budget, charge, payment_event, payable e bank_statement_line.
 * Fala com o razão, o cadastro e os vínculos só pelos serviços públicos desses módulos.
 */
@Module({
  imports: [OrgModule, IdentityModule, LedgerModule, DocumentsModule],
  controllers: [BillingController, PayableController, ReconciliationController, WebhookController],
  providers: [
    {
      provide: PAYMENT_PROVIDER,
      inject: [ENV],
      useFactory: (env: Env): PaymentProvider =>
        env.PAYMENT_PROVIDER === 'asaas'
          ? new AsaasPaymentProvider(env.ASAAS_BASE_URL, env.ASAAS_ROOT_API_KEY ?? '')
          : new FakePaymentProvider(),
    },
    BudgetService,
    ChargeService,
    PayableService,
    PaymentAccountService,
    RateioService,
    ReconciliationService,
    WebhookService,
  ],
  exports: [ChargeService, PaymentAccountService],
})
export class BillingModule {}
