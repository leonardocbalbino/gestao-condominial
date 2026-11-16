import { Inject, Injectable, Logger, NotFoundException, type OnModuleInit } from '@nestjs/common';
import type {
  ReconciliationResultDto,
  ResolveExceptionRequest,
  StatementLineDto,
} from '@condo/contracts';
import { and, asc, eq, gte, lt, sql } from 'drizzle-orm';
import { nextMonth, todayInBrazil } from '../../common/dates';
import { APP_DB, PLATFORM_DB } from '../../db/database.module';
import { currentContext, runInContext, type Database } from '../../db/request-context';
import { bankStatementLine } from '../../db/schema';
import { SystemJobs } from '../../outbox/system-jobs';
import { AuditService } from '../audit/audit.service';
import { ClosingGuards } from '../ledger/closing-guards';
import { JournalService } from '../ledger/journal.service';
import { PaymentAccountService } from './payment-account.service';
import {
  PAYMENT_PROVIDER,
  type PaymentProvider,
  type StatementEntry,
} from './provider/payment-provider';

type LineRow = typeof bankStatementLine.$inferSelect;

const toDto = (row: LineRow): StatementLineDto => ({
  id: row.id,
  data: row.data,
  valorCentavos: row.valorCentavos,
  descricao: row.descricao,
  status: row.status,
  matchEntryId: row.matchEntryId,
  motivo: row.motivo,
  notaResolucao: row.notaResolucao,
});

const brl = (centavos: number): string =>
  (centavos / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

/**
 * Conciliação (§5): puxa o extrato da subconta e casa cada linha com o lançamento do
 * razão de mesma origem e mesmo valor no banco. O que não casa vai para a fila de
 * exceções da gestora, e o mês não fecha com exceção aberta.
 */
@Injectable()
export class ReconciliationService implements OnModuleInit {
  private readonly logger = new Logger(ReconciliationService.name);

  constructor(
    @Inject(PAYMENT_PROVIDER) private readonly provider: PaymentProvider,
    @Inject(APP_DB) private readonly appDb: Database,
    @Inject(PLATFORM_DB) private readonly platformDb: Database,
    private readonly paymentAccounts: PaymentAccountService,
    private readonly journal: JournalService,
    private readonly audit: AuditService,
    private readonly guards: ClosingGuards,
    private readonly systemJobs: SystemJobs,
  ) {}

  onModuleInit(): void {
    this.guards.register((condominioId, mes) => this.blocksClosing(condominioId, mes));
    this.systemJobs.register({
      name: 'conciliacao-diaria',
      pattern: '0 6 * * *',
      run: () => this.runAll(),
    });
  }

  async run(condominioId: string): Promise<ReconciliationResultDto> {
    const cursor = await this.paymentAccounts.statementCursor(condominioId);
    const creds = await this.paymentAccounts.credentials(condominioId);
    const today = todayInBrazil();
    // Reimporta o último dia já lido: linhas repetidas são ignoradas pela chave única.
    const from = cursor.extratoAte ?? cursor.createdAt.toISOString().slice(0, 10);
    const entries = await this.provider.listStatement(creds, from, today);

    const { tx, gestoraId } = currentContext();
    if (!gestoraId) throw new Error('Conciliação exige gestora em contexto');
    const existing = new Set(
      (
        await tx
          .select({ id: bankStatementLine.providerTxId })
          .from(bankStatementLine)
          .where(
            and(
              eq(bankStatementLine.condominioId, condominioId),
              gte(bankStatementLine.data, from),
            ),
          )
      ).map((r) => r.id),
    );
    const fresh = entries.filter((e) => !existing.has(e.providerTxId));

    const charges = await this.journal.bankMovementsByOrigin(
      condominioId,
      'recebimento',
      fresh.flatMap((e) => (e.ref?.tipo === 'charge' ? [e.ref.id] : [])),
    );
    const bills = await this.journal.bankMovementsByOrigin(
      condominioId,
      'pagamento',
      fresh.flatMap((e) => (e.ref?.tipo === 'bill' ? [e.ref.id] : [])),
    );

    let conciliadas = 0;
    let excecoes = 0;
    for (const entry of fresh) {
      const match = this.match(entry, entry.ref?.tipo === 'bill' ? bills : charges);
      if (match.entryId) conciliadas++;
      else excecoes++;
      await tx
        .insert(bankStatementLine)
        .values({
          gestoraId,
          condominioId,
          providerTxId: entry.providerTxId,
          data: entry.data,
          valorCentavos: entry.valorCentavos,
          descricao: entry.descricao.slice(0, 500),
          refTipo: entry.ref?.tipo ?? null,
          refId: entry.ref?.id ?? null,
          status: match.entryId ? 'conciliada' : 'excecao',
          matchEntryId: match.entryId,
          motivo: match.motivo,
        })
        .onConflictDoNothing();
    }
    await this.paymentAccounts.setStatementCursor(condominioId, today);
    const result = { importadas: fresh.length, conciliadas, excecoes };
    await this.audit.record({
      action: 'reconciliation.run',
      resourceType: 'condominio',
      resourceId: condominioId,
      after: { ...result, de: from, ate: today },
    });
    return result;
  }

  async list(condominioId: string, status?: LineRow['status']): Promise<StatementLineDto[]> {
    const { tx } = currentContext();
    const rows = await tx
      .select()
      .from(bankStatementLine)
      .where(
        and(
          eq(bankStatementLine.condominioId, condominioId),
          ...(status ? [eq(bankStatementLine.status, status)] : []),
        ),
      )
      .orderBy(asc(bankStatementLine.data), asc(bankStatementLine.createdAt));
    return rows.map(toDto);
  }

  async resolve(
    condominioId: string,
    lineId: string,
    input: ResolveExceptionRequest,
  ): Promise<StatementLineDto> {
    if (input.acao === 'vincular' && input.entryId) {
      await this.journal.get(condominioId, input.entryId);
    }
    const { tx, userId } = currentContext();
    const [row] = await tx
      .update(bankStatementLine)
      .set({
        status: 'resolvida',
        matchEntryId: input.acao === 'vincular' ? (input.entryId ?? null) : null,
        resolvidoPor: userId,
        resolvidoEm: sql`now()`,
        notaResolucao: input.nota,
      })
      .where(
        and(
          eq(bankStatementLine.id, lineId),
          eq(bankStatementLine.condominioId, condominioId),
          eq(bankStatementLine.status, 'excecao'),
        ),
      )
      .returning();
    if (!row) throw new NotFoundException('Exceção aberta não encontrada');
    const dto = toDto(row);
    await this.audit.record({
      action: 'reconciliation.exception_resolved',
      resourceType: 'bank_statement_line',
      resourceId: lineId,
      after: { ...dto, acao: input.acao },
    });
    return dto;
  }

  private match(
    entry: StatementEntry,
    movements: Map<string, { entryId: string; bancoCentavos: number }>,
  ): { entryId: string | null; motivo: string | null } {
    if (!entry.ref) return { entryId: null, motivo: 'Movimentação sem origem conhecida' };
    const found = movements.get(entry.ref.id);
    if (!found) return { entryId: null, motivo: 'Sem lançamento correspondente no razão' };
    if (found.bancoCentavos !== entry.valorCentavos) {
      return {
        entryId: null,
        motivo: `Valor diverge: razão ${brl(found.bancoCentavos)}, extrato ${brl(entry.valorCentavos)}`,
      };
    }
    return { entryId: found.entryId, motivo: null };
  }

  private async blocksClosing(condominioId: string, mes: string): Promise<string | null> {
    const { tx } = currentContext();
    const [row] = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(bankStatementLine)
      .where(
        and(
          eq(bankStatementLine.condominioId, condominioId),
          eq(bankStatementLine.status, 'excecao'),
          lt(bankStatementLine.data, nextMonth(mes)),
        ),
      );
    const n = row?.n ?? 0;
    return n > 0 ? `${n} exceção(ões) de conciliação em aberto até este mês` : null;
  }

  /** Tarefa diária: concilia cada condomínio com conta no broker, no contexto da gestora. */
  private async runAll(): Promise<void> {
    const accounts = await this.platformDb.execute<{ gestora_id: string; condominio_id: string }>(
      sql`SELECT gestora_id, condominio_id FROM payment_account`,
    );
    for (const acc of accounts.rows) {
      try {
        await runInContext(
          this.appDb,
          {
            gestoraId: acc.gestora_id,
            userId: null,
            mfa: false,
            ip: null,
            requestId: 'conciliacao-diaria',
          },
          () => this.run(acc.condominio_id),
        );
      } catch (error) {
        this.logger.error({ err: error, condominioId: acc.condominio_id }, 'Falha na conciliação');
      }
    }
  }
}
