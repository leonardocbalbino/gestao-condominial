import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { CreateEntryRequest, JournalEntryDto, JournalLineDto } from '@condo/contracts';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { todayInBrazil } from '../../common/dates';
import { isUniqueViolation } from '../../db/errors';
import { currentContext } from '../../db/request-context';
import { account, ENTRY_ORIGENS, journalEntry, journalLine } from '../../db/schema';
import { AuditService } from '../audit/audit.service';
import { AttachmentService } from '../documents/attachment.service';
import { AccountService } from './account.service';
import { PeriodService } from './period.service';

type EntryRow = typeof journalEntry.$inferSelect;
export type EntryOrigem = Exclude<(typeof ENTRY_ORIGENS)[number], 'estorno'>;

export interface PostEntryInput extends CreateEntryRequest {
  origem: EntryOrigem;
  /** Id do objeto de origem (cobrança, pagamento…). Repetir o mesmo par não duplica. */
  origemRef?: string;
}

/**
 * Razão de partidas dobradas. Só insere: correção é estorno (regra §3.3). O banco garante
 * soma zero, conta analítica, período aberto e comprovante em saída de caixa; os testes
 * aqui só dão mensagens melhores antes.
 */
@Injectable()
export class JournalService {
  constructor(
    private readonly accounts: AccountService,
    private readonly periods: PeriodService,
    private readonly attachments: AttachmentService,
    private readonly audit: AuditService,
  ) {}

  async post(condominioId: string, input: PostEntryInput): Promise<JournalEntryDto> {
    const dto = await this.insert(condominioId, input);
    await this.audit.record({
      action: 'journal_entry.posted',
      resourceType: 'journal_entry',
      resourceId: dto.id,
      after: dto,
    });
    return dto;
  }

  /**
   * Lança se ainda não houver lançamento com a mesma origem; devolve `null` se já houver.
   * Para automações reprocessáveis (webhook repetido não duplica baixa). Não audita.
   */
  async postOnce(
    condominioId: string,
    input: PostEntryInput & { origemRef: string },
  ): Promise<JournalEntryDto | null> {
    const { tx } = currentContext();
    const [existing] = await tx
      .select({ id: journalEntry.id })
      .from(journalEntry)
      .where(
        and(
          eq(journalEntry.condominioId, condominioId),
          eq(journalEntry.origem, input.origem),
          eq(journalEntry.origemRef, input.origemRef),
        ),
      );
    if (existing) return null;
    return this.insert(condominioId, input);
  }

  /** Estorno: lançamento novo com as linhas invertidas, no período aberto de hoje. */
  async reverse(condominioId: string, entryId: string, motivo: string): Promise<JournalEntryDto> {
    const original = await this.get(condominioId, entryId);
    if (original.origem === 'estorno') {
      throw new BadRequestException('Não se estorna um estorno; lance de novo o valor correto');
    }
    if (original.estornadoPor) throw new ConflictException('Este lançamento já foi estornado');

    const { tx, gestoraId, userId } = currentContext();
    if (!gestoraId) throw new Error('Lançamento exige gestora em contexto');
    const dataCaixa = todayInBrazil();
    const period = await this.periods.forCashDate(condominioId, dataCaixa);
    let row: EntryRow | undefined;
    try {
      [row] = await tx
        .insert(journalEntry)
        .values({
          gestoraId,
          condominioId,
          periodId: period.id,
          dataCompetencia: original.dataCompetencia,
          dataCaixa,
          historico: `Estorno: ${original.historico}`.slice(0, 500),
          origem: 'estorno',
          origemRef: original.origemRef,
          estornoDe: original.id,
          motivoEstorno: motivo,
          comprovanteId: original.comprovanteId,
          createdBy: userId,
        })
        .returning();
    } catch (error) {
      if (isUniqueViolation(error)) throw new ConflictException('Este lançamento já foi estornado');
      throw error;
    }
    if (!row) throw new Error('Falha ao estornar');
    const entryId2 = row.id;
    await tx.insert(journalLine).values(
      original.linhas.map((l) => ({
        gestoraId,
        condominioId,
        entryId: entryId2,
        accountId: l.accountId,
        valorCentavos: -l.valorCentavos,
      })),
    );
    const dto = await this.get(condominioId, row.id);
    await this.audit.record({
      action: 'journal_entry.reversed',
      resourceType: 'journal_entry',
      resourceId: dto.id,
      before: { id: original.id },
      after: dto,
    });
    return dto;
  }

  /**
   * Lançamentos automáticos pela origem (ex.: recebimento de cobrança `pay_123`), com o
   * movimento na conta banco. Usado pela conciliação. Estornados ficam de fora.
   */
  async bankMovementsByOrigin(
    condominioId: string,
    origem: EntryOrigem,
    refs: string[],
  ): Promise<Map<string, { entryId: string; bancoCentavos: number }>> {
    if (refs.length === 0) return new Map();
    const banco = await this.accounts.byPapel(condominioId, 'banco');
    const { tx } = currentContext();
    const rows = await tx
      .select({
        entryId: journalEntry.id,
        ref: journalEntry.origemRef,
        valor: journalLine.valorCentavos,
      })
      .from(journalEntry)
      .innerJoin(journalLine, eq(journalLine.entryId, journalEntry.id))
      .where(
        and(
          eq(journalEntry.condominioId, condominioId),
          eq(journalEntry.origem, origem),
          inArray(journalEntry.origemRef, refs),
          eq(journalLine.accountId, banco.id),
          sql`NOT EXISTS (SELECT 1 FROM journal_entry r WHERE r.estorno_de = ${journalEntry.id})`,
        ),
      );
    const result = new Map<string, { entryId: string; bancoCentavos: number }>();
    for (const r of rows) {
      if (!r.ref) continue;
      const current = result.get(r.ref);
      result.set(r.ref, {
        entryId: r.entryId,
        bancoCentavos: (current?.bancoCentavos ?? 0) + r.valor,
      });
    }
    return result;
  }

  async get(condominioId: string, entryId: string): Promise<JournalEntryDto> {
    const [dto] = await this.load(condominioId, [eq(journalEntry.id, entryId)]);
    if (!dto) throw new NotFoundException('Lançamento não encontrado');
    return dto;
  }

  async listByPeriod(condominioId: string, periodId: string): Promise<JournalEntryDto[]> {
    await this.periods.get(condominioId, periodId);
    return this.load(condominioId, [eq(journalEntry.periodId, periodId)]);
  }

  private async insert(condominioId: string, input: PostEntryInput): Promise<JournalEntryDto> {
    const { tx, gestoraId, userId } = currentContext();
    if (!gestoraId) throw new Error('Lançamento exige gestora em contexto');
    const sum = input.linhas.reduce((acc, l) => acc + l.valorCentavos, 0);
    if (sum !== 0 || input.linhas.length < 2) {
      throw new BadRequestException('Débitos e créditos precisam somar zero');
    }
    const accounts = await this.accounts.getMany(condominioId, [
      ...new Set(input.linhas.map((l) => l.accountId)),
    ]);
    const byId = new Map(accounts.map((a) => [a.id, a]));
    for (const line of input.linhas) {
      const acc = byId.get(line.accountId);
      if (!acc) throw new BadRequestException('Conta não pertence a este condomínio');
      if (!acc.analitica || !acc.ativa) {
        throw new BadRequestException(`A conta ${acc.codigo} não recebe lançamentos`);
      }
    }
    const isCashOutflow = input.linhas.some(
      (l) => (byId.get(l.accountId)?.caixa ?? false) && l.valorCentavos < 0,
    );
    if (input.comprovanteId) {
      await this.attachments.get(condominioId, input.comprovanteId);
    } else if (isCashOutflow) {
      throw new BadRequestException('Saída de dinheiro exige comprovante anexado');
    }

    const period = await this.periods.forCashDate(condominioId, input.dataCaixa);
    let row: EntryRow | undefined;
    try {
      [row] = await tx
        .insert(journalEntry)
        .values({
          gestoraId,
          condominioId,
          periodId: period.id,
          dataCompetencia: input.dataCompetencia,
          dataCaixa: input.dataCaixa,
          historico: input.historico,
          origem: input.origem,
          origemRef: input.origemRef ?? null,
          comprovanteId: input.comprovanteId ?? null,
          createdBy: userId,
        })
        .returning();
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException('Já existe lançamento para esta origem');
      }
      throw error;
    }
    if (!row) throw new Error('Falha ao lançar');
    const entryId = row.id;
    await tx.insert(journalLine).values(
      input.linhas.map((l) => ({
        gestoraId,
        condominioId,
        entryId,
        accountId: l.accountId,
        valorCentavos: l.valorCentavos,
      })),
    );
    return this.get(condominioId, entryId);
  }

  private async load(
    condominioId: string,
    filters: ReturnType<typeof eq>[],
  ): Promise<JournalEntryDto[]> {
    const { tx } = currentContext();
    const entries = await tx
      .select()
      .from(journalEntry)
      .where(and(eq(journalEntry.condominioId, condominioId), ...filters))
      .orderBy(asc(journalEntry.seq));
    if (entries.length === 0) return [];
    const ids = entries.map((e) => e.id);
    const lines = await tx
      .select({
        entryId: journalLine.entryId,
        accountId: journalLine.accountId,
        valorCentavos: journalLine.valorCentavos,
        codigo: account.codigo,
        conta: account.nome,
      })
      .from(journalLine)
      .innerJoin(account, eq(account.id, journalLine.accountId))
      .where(inArray(journalLine.entryId, ids))
      .orderBy(asc(account.codigo));
    const reversals = await tx
      .select({ id: journalEntry.id, estornoDe: journalEntry.estornoDe })
      .from(journalEntry)
      .where(inArray(journalEntry.estornoDe, ids));
    const reversedBy = new Map(reversals.map((r) => [r.estornoDe, r.id]));

    return entries.map((e) => ({
      id: e.id,
      periodId: e.periodId,
      dataCompetencia: e.dataCompetencia,
      dataCaixa: e.dataCaixa,
      historico: e.historico,
      origem: e.origem,
      origemRef: e.origemRef,
      estornoDe: e.estornoDe,
      estornadoPor: reversedBy.get(e.id) ?? null,
      motivoEstorno: e.motivoEstorno,
      comprovanteId: e.comprovanteId,
      linhas: lines
        .filter((l) => l.entryId === e.id)
        .map((l): JournalLineDto => ({
          accountId: l.accountId,
          codigo: l.codigo,
          conta: l.conta,
          valorCentavos: l.valorCentavos,
        })),
    }));
  }
}
