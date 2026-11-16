import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { ActivatePaymentAccountRequest, PaymentAccountDto } from '@condo/contracts';
import { eq } from 'drizzle-orm';
import { randomToken, SecretBox } from '../../common/crypto';
import { ENV, type Env } from '../../config/env';
import { currentContext } from '../../db/request-context';
import { paymentAccount } from '../../db/schema';
import { AuditService } from '../audit/audit.service';
import { SECRET_BOX } from '../identity/auth.service';
import { CondominioService } from '../org/condominio.service';
import {
  PAYMENT_PROVIDER,
  type PaymentProvider,
  type ProviderAccount,
} from './provider/payment-provider';

type AccountRow = typeof paymentAccount.$inferSelect;

export const webhookPath = (provider: string, gestoraId: string, condominioId: string): string =>
  `/webhooks/${provider}/${gestoraId}/${condominioId}`;

/**
 * Subconta do condomínio no broker. O dinheiro do condomínio entra sempre nela; a chave
 * de API e o token do webhook ficam cifrados (AES-256-GCM) e só são abertos em memória.
 */
@Injectable()
export class PaymentAccountService {
  constructor(
    @Inject(PAYMENT_PROVIDER) private readonly provider: PaymentProvider,
    @Inject(SECRET_BOX) private readonly box: SecretBox,
    @Inject(ENV) private readonly env: Env,
    private readonly condominios: CondominioService,
    private readonly audit: AuditService,
  ) {}

  async activate(
    condominioId: string,
    input: ActivatePaymentAccountRequest,
  ): Promise<PaymentAccountDto> {
    const { tx, gestoraId } = currentContext();
    if (!gestoraId) throw new Error('Conta de pagamento exige gestora em contexto');
    if (await this.find(condominioId)) {
      throw new ConflictException('Este condomínio já tem conta no broker');
    }
    const profile = await this.condominios.billingProfile(condominioId);
    await this.condominios.setEndereco(condominioId, input.endereco);

    const webhookToken = randomToken();
    const path = webhookPath(this.provider.name, gestoraId, condominioId);
    const created = await this.provider.createSubaccount({
      nome: profile.nome,
      cnpj: profile.cnpj,
      email: input.email,
      telefone: input.telefone,
      endereco: input.endereco,
      faturamentoMensalCentavos: input.faturamentoMensalCentavos,
      webhookUrl: `${this.env.APP_API_URL}${path}`,
      webhookToken,
    });
    await tx.insert(paymentAccount).values({
      gestoraId,
      condominioId,
      provider: this.provider.name,
      providerAccountId: created.accountId,
      walletId: created.walletId,
      apiKeyEnc: this.box.encrypt(created.apiKey),
      webhookTokenEnc: this.box.encrypt(webhookToken),
    });
    const dto: PaymentAccountDto = {
      provider: this.provider.name,
      providerAccountId: created.accountId,
      walletId: created.walletId,
      webhookPath: path,
    };
    await this.audit.record({
      action: 'payment_account.created',
      resourceType: 'condominio',
      resourceId: condominioId,
      after: dto,
    });
    return dto;
  }

  async get(condominioId: string): Promise<PaymentAccountDto> {
    const { gestoraId } = currentContext();
    const row = await this.find(condominioId);
    if (!row || !gestoraId) throw new NotFoundException('Condomínio sem conta no broker');
    return {
      provider: row.provider,
      providerAccountId: row.providerAccountId,
      walletId: row.walletId,
      webhookPath: webhookPath(row.provider, gestoraId, condominioId),
    };
  }

  /** Provedor da conta, ou nulo se o condomínio ainda não abriu a conta de pagamentos. */
  async providerOf(condominioId: string): Promise<string | null> {
    return (await this.find(condominioId))?.provider ?? null;
  }

  /** Credenciais decifradas para falar com o broker. Nunca devolver pela API nem logar. */
  async credentials(condominioId: string): Promise<ProviderAccount & { provider: string }> {
    const row = await this.find(condominioId);
    if (!row) throw new NotFoundException('Condomínio sem conta no broker');
    return {
      provider: row.provider,
      accountId: row.providerAccountId,
      walletId: row.walletId,
      apiKey: this.box.decrypt(row.apiKeyEnc),
      webhookToken: this.box.decrypt(row.webhookTokenEnc),
    };
  }

  async statementCursor(
    condominioId: string,
  ): Promise<{ extratoAte: string | null; createdAt: Date }> {
    const row = await this.find(condominioId);
    if (!row) throw new NotFoundException('Condomínio sem conta no broker');
    return { extratoAte: row.extratoAte, createdAt: row.createdAt };
  }

  async setStatementCursor(condominioId: string, extratoAte: string): Promise<void> {
    const { tx } = currentContext();
    await tx
      .update(paymentAccount)
      .set({ extratoAte })
      .where(eq(paymentAccount.condominioId, condominioId));
  }

  /** Split da tarifa da plataforma, quando configurada. */
  platformSplit(): { walletId: string; valorCentavos: number } | null {
    if (this.env.PLATFORM_FEE_CENTAVOS <= 0) return null;
    const walletId =
      this.env.PLATFORM_WALLET_ID ??
      (this.provider.name === 'fake' ? 'fake_platform_wallet' : null);
    return walletId ? { walletId, valorCentavos: this.env.PLATFORM_FEE_CENTAVOS } : null;
  }

  private async find(condominioId: string): Promise<AccountRow | undefined> {
    const { tx } = currentContext();
    const [row] = await tx
      .select()
      .from(paymentAccount)
      .where(eq(paymentAccount.condominioId, condominioId));
    return row;
  }
}
