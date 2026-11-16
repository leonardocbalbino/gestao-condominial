import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  type OnModuleInit,
} from '@nestjs/common';
import {
  nomeDoMes,
  valorAtualizado,
  type ChargeDto,
  type ChargeStatus,
  type MyChargeDto,
} from '@condo/contracts';
import { and, asc, desc, eq, inArray, lt, ne } from 'drizzle-orm';
import { todayInBrazil } from '../../common/dates';
import { currentContext } from '../../db/request-context';
import { charge, chargeItem } from '../../db/schema';
import { OutboxHandlers } from '../../outbox/outbox.service';
import { AuditService } from '../audit/audit.service';
import { AccountService } from '../ledger/account.service';
import { JournalService } from '../ledger/journal.service';
import { PersonService } from '../org/person.service';
import { describeUnit, UnitService } from '../org/unit.service';
import { PaymentAccountService } from './payment-account.service';
import { AsaasError } from './provider/asaas.provider';
import { PAYMENT_PROVIDER, type PaymentProvider } from './provider/payment-provider';
import { splitLargestRemainder } from './rateio';
import { CHARGE_EMIT_TOPIC } from './rateio.service';

type ChargeRow = typeof charge.$inferSelect;

export interface InadimplenciaDto {
  chargeId: string;
  unidade: string;
  pagador: string | null;
  competencia: string;
  vencimento: string;
  valorCentavos: number;
  valorAtualizadoCentavos: number;
  diasAtraso: number;
}

@Injectable()
export class ChargeService implements OnModuleInit {
  private readonly logger = new Logger(ChargeService.name);

  constructor(
    @Inject(PAYMENT_PROVIDER) private readonly provider: PaymentProvider,
    private readonly paymentAccounts: PaymentAccountService,
    private readonly units: UnitService,
    private readonly persons: PersonService,
    private readonly accounts: AccountService,
    private readonly journal: JournalService,
    private readonly audit: AuditService,
    private readonly handlers: OutboxHandlers,
  ) {}

  onModuleInit(): void {
    this.handlers.register(CHARGE_EMIT_TOPIC, (payload, meta) =>
      this.emit(meta.condominioId ?? '', String(payload['chargeId'])),
    );
  }

  /** Cobranças do condomínio (gestora, síndico, conselho), por competência AAAA-MM. */
  async list(condominioId: string, competencia?: string): Promise<ChargeDto[]> {
    const rows = await this.rows(condominioId, [
      ...(competencia ? [eq(charge.competencia, `${competencia}-01`)] : []),
    ]);
    return this.toDtos(condominioId, rows);
  }

  /** Cobranças da unidade, como o morador vê: título simples e valor já atualizado. */
  async ofUnit(condominioId: string, unitId: string): Promise<MyChargeDto[]> {
    const rows = await this.rows(condominioId, [
      eq(charge.unitId, unitId),
      ne(charge.status, 'cancelada'),
    ]);
    const hoje = todayInBrazil();
    return (await this.toDtos(condominioId, rows)).map((dto, i) => {
      const row = rows[i];
      const aberta = dto.status !== 'paga';
      const atual = valorAtualizado({
        valorCentavos: dto.valorCentavos,
        vencimento: dto.vencimento,
        hoje,
        multaBp: row?.multaBp ?? 0,
        jurosMensalBp: row?.jurosMensalBp ?? 0,
      });
      return {
        ...dto,
        titulo: `Sua taxa de ${nomeDoMes(dto.competencia)}`,
        atrasada: aberta && atual.diasAtraso > 0,
        diasAtraso: aberta ? atual.diasAtraso : 0,
        valorAtualizadoCentavos: aberta ? atual.totalCentavos : dto.valorCentavos,
      };
    });
  }

  /** Inadimplência nominal (gestora, síndico, conselho — regra §3.9). */
  async inadimplencia(condominioId: string): Promise<InadimplenciaDto[]> {
    const hoje = todayInBrazil();
    const rows = await this.rows(condominioId, [
      inArray(charge.status, ['emitida', 'pendente_emissao', 'erro_emissao']),
      lt(charge.vencimento, hoje),
    ]);
    const units = new Map((await this.units.list(condominioId)).map((u) => [u.id, u]));
    const people = await this.persons.billingData(
      rows.flatMap((r) => (r.pagadorPersonId ? [r.pagadorPersonId] : [])),
    );
    return rows.map((r) => {
      const atual = valorAtualizado({
        valorCentavos: r.valorCentavos,
        vencimento: r.vencimento,
        hoje,
        multaBp: r.multaBp,
        jurosMensalBp: r.jurosMensalBp,
      });
      const u = units.get(r.unitId);
      return {
        chargeId: r.id,
        unidade: u ? describeUnit(u) : r.unitId,
        pagador: r.pagadorPersonId ? (people.get(r.pagadorPersonId)?.nome ?? null) : null,
        competencia: r.competencia.slice(0, 7),
        vencimento: r.vencimento,
        valorCentavos: r.valorCentavos,
        valorAtualizadoCentavos: atual.totalCentavos,
        diasAtraso: atual.diasAtraso,
      };
    });
  }

  async byProviderId(condominioId: string, providerChargeId: string): Promise<ChargeRow | null> {
    const [row] = await this.rows(condominioId, [eq(charge.providerChargeId, providerChargeId)]);
    return row ?? null;
  }

  async row(condominioId: string, chargeId: string): Promise<ChargeRow> {
    const [row] = await this.rows(condominioId, [eq(charge.id, chargeId)]);
    if (!row) throw new NotFoundException('Cobrança não encontrada');
    return row;
  }

  /**
   * Emite a cobrança no broker (handler do outbox). Idempotente: se já tem id no broker,
   * nada a fazer; se o broker já tem a referência (falha entre o broker e o COMMIT),
   * reaproveita em vez de criar outro boleto.
   */
  async emit(condominioId: string, chargeId: string): Promise<void> {
    const row = await this.row(condominioId, chargeId);
    if (row.providerChargeId || row.status !== 'pendente_emissao') return;
    const creds = await this.paymentAccounts.credentials(condominioId);
    const payer = row.pagadorPersonId
      ? (await this.persons.billingData([row.pagadorPersonId])).get(row.pagadorPersonId)
      : undefined;
    const unit = await this.units.get(condominioId, row.unitId);

    const { tx } = currentContext();
    if (!payer?.cpf) {
      await this.markEmissionError(row, 'Pagador sem CPF cadastrado');
      return;
    }
    try {
      const existing = await this.provider.findChargeByReference(creds, row.id);
      const created =
        existing ??
        (await this.provider.createCharge(creds, {
          externalReference: row.id,
          pagador: { nome: payer.nome, documento: payer.cpf, email: payer.email },
          valorCentavos: row.valorCentavos,
          vencimento: row.vencimento,
          descricao: `Taxa de ${nomeDoMes(row.competencia)} · ${describeUnit(unit)}`,
          multaBp: row.multaBp,
          jurosMensalBp: row.jurosMensalBp,
          split: this.paymentAccounts.platformSplit(),
        }));
      await tx
        .update(charge)
        .set({
          status: 'emitida',
          providerChargeId: created.id,
          linhaDigitavel: created.linhaDigitavel,
          pixCopiaCola: created.pixCopiaCola,
          boletoUrl: created.boletoUrl,
          erroEmissao: null,
        })
        .where(eq(charge.id, row.id));
      await this.audit.record({
        action: 'charge.issued',
        resourceType: 'charge',
        resourceId: row.id,
        after: { providerChargeId: created.id, valorCentavos: row.valorCentavos },
      });
    } catch (error) {
      // Erro de validação do broker não melhora com retry: vai para a fila de exceções.
      if (error instanceof AsaasError && error.status >= 400 && error.status < 500) {
        await this.markEmissionError(row, `Broker recusou: ${error.body.slice(0, 300)}`);
        return;
      }
      throw error;
    }
  }

  /**
   * Baixa automática: marca paga e lança no razão (regime de caixa). Idempotente pela
   * origem (id da cobrança no broker): webhook repetido nunca duplica baixa.
   * Linhas: banco (líquido) + tarifas (bruto − líquido) = itens + multa + juros.
   */
  async settle(
    condominioId: string,
    row: ChargeRow,
    paid: { valorPagoCentavos: number; valorLiquidoCentavos: number; pagoEm: string },
  ): Promise<'baixada' | 'ja_baixada'> {
    if (row.status === 'paga') return 'ja_baixada';
    if (!row.providerChargeId) throw new BadRequestException('Cobrança sem id no broker');
    const items = await this.items([row.id]);
    const banco = await this.accounts.byPapel(condominioId, 'banco');
    const tarifa = await this.accounts.byPapel(condominioId, 'tarifa_bancaria');

    const credits: { accountId: string; valorCentavos: number }[] = [];
    const extra = paid.valorPagoCentavos - row.valorCentavos;
    if (extra >= 0) {
      for (const i of items)
        credits.push({ accountId: i.accountId, valorCentavos: i.valorCentavos });
      if (extra > 0) {
        // Encargos: primeiro a multa calculada sobre o valor original, o resto é juros.
        const multa = Math.min(extra, Math.round((row.valorCentavos * row.multaBp) / 10_000));
        if (multa > 0) {
          const conta = await this.accounts.byPapel(condominioId, 'multa');
          credits.push({ accountId: conta.id, valorCentavos: multa });
        }
        if (extra - multa > 0) {
          const conta = await this.accounts.byPapel(condominioId, 'juros');
          credits.push({ accountId: conta.id, valorCentavos: extra - multa });
        }
      }
    } else {
      // Pagou menos: distribui o recebido entre os itens na proporção (maior resto).
      const parts = splitLargestRemainder(
        paid.valorPagoCentavos,
        items.map((i) => BigInt(i.valorCentavos)),
      );
      items.forEach((i, idx) =>
        credits.push({ accountId: i.accountId, valorCentavos: parts[idx] ?? 0 }),
      );
    }

    const fees = paid.valorPagoCentavos - paid.valorLiquidoCentavos;
    if (fees < 0) throw new Error('Valor líquido maior que o pago');
    const unit = await this.units.get(condominioId, row.unitId);
    await this.journal.postOnce(condominioId, {
      origem: 'recebimento',
      origemRef: row.providerChargeId,
      dataCaixa: paid.pagoEm,
      dataCompetencia: row.competencia,
      historico: `Recebimento da taxa de ${nomeDoMes(row.competencia)} · ${describeUnit(unit)}`,
      linhas: [
        { accountId: banco.id, valorCentavos: paid.valorLiquidoCentavos },
        ...(fees > 0 ? [{ accountId: tarifa.id, valorCentavos: fees }] : []),
        ...credits
          .filter((c) => c.valorCentavos > 0)
          .map((c) => ({ accountId: c.accountId, valorCentavos: -c.valorCentavos })),
      ],
    });
    const { tx } = currentContext();
    await tx
      .update(charge)
      .set({ status: 'paga', pagoEm: paid.pagoEm, valorPagoCentavos: paid.valorPagoCentavos })
      .where(eq(charge.id, row.id));
    await this.audit.record({
      action: 'charge.paid',
      resourceType: 'charge',
      resourceId: row.id,
      after: { ...paid, providerChargeId: row.providerChargeId },
    });
    return 'baixada';
  }

  async cancelFromProvider(row: ChargeRow): Promise<'cancelada' | 'ignorado'> {
    if (row.status === 'paga' || row.status === 'cancelada') return 'ignorado';
    const { tx } = currentContext();
    await tx.update(charge).set({ status: 'cancelada' }).where(eq(charge.id, row.id));
    await this.audit.record({
      action: 'charge.cancelled',
      resourceType: 'charge',
      resourceId: row.id,
      before: { status: row.status },
    });
    return 'cancelada';
  }

  private async markEmissionError(row: ChargeRow, message: string): Promise<void> {
    const { tx } = currentContext();
    await tx
      .update(charge)
      .set({ status: 'erro_emissao', erroEmissao: message })
      .where(eq(charge.id, row.id));
    await this.audit.record({
      action: 'charge.issue_failed',
      resourceType: 'charge',
      resourceId: row.id,
      after: { erro: message },
    });
    this.logger.warn({ chargeId: row.id }, 'Emissão de cobrança recusada');
  }

  private async rows(condominioId: string, filters: ReturnType<typeof eq>[]): Promise<ChargeRow[]> {
    const { tx } = currentContext();
    return tx
      .select()
      .from(charge)
      .where(and(eq(charge.condominioId, condominioId), ...filters))
      .orderBy(desc(charge.competencia), asc(charge.vencimento), asc(charge.createdAt));
  }

  private async items(chargeIds: string[]) {
    if (chargeIds.length === 0) return [];
    const { tx } = currentContext();
    return tx
      .select()
      .from(chargeItem)
      .where(inArray(chargeItem.chargeId, chargeIds))
      .orderBy(asc(chargeItem.descricao));
  }

  private async toDtos(condominioId: string, rows: ChargeRow[]): Promise<ChargeDto[]> {
    const items = await this.items(rows.map((r) => r.id));
    const units = new Map((await this.units.list(condominioId)).map((u) => [u.id, u]));
    return rows.map((r) => {
      const u = units.get(r.unitId);
      return {
        id: r.id,
        unitId: r.unitId,
        unidade: u ? describeUnit(u) : '',
        competencia: r.competencia.slice(0, 7),
        vencimento: r.vencimento,
        valorCentavos: r.valorCentavos,
        status: r.status as ChargeStatus,
        linhaDigitavel: r.linhaDigitavel,
        pixCopiaCola: r.pixCopiaCola,
        boletoUrl: r.boletoUrl,
        pagoEm: r.pagoEm,
        valorPagoCentavos: r.valorPagoCentavos,
        erroEmissao: r.erroEmissao,
        itens: items
          .filter((i) => i.chargeId === r.id)
          .map((i) => ({ descricao: i.descricao, valorCentavos: i.valorCentavos })),
      };
    });
  }
}
