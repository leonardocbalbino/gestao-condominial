import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { PeriodDto } from '@condo/contracts';
import { and, asc, desc, eq, gte, lt, sql } from 'drizzle-orm';
import { currentContext } from '../../db/request-context';
import { accountingPeriod } from '../../db/schema';
import { AuditService } from '../audit/audit.service';

type PeriodRow = typeof accountingPeriod.$inferSelect;

export const toPeriodDto = (row: PeriodRow): PeriodDto => ({
  id: row.id,
  mes: row.mes.slice(0, 7),
  status: row.status,
  hash: row.hash,
  fechadoEm: row.fechadoEm?.toISOString() ?? null,
});

/** '2026-10' ou '2026-10-15' → '2026-10-01'. */
export const firstDayOf = (value: string): string => `${value.slice(0, 7)}-01`;

const nextMonth = (mes: string): string => {
  const [y, m] = mes.split('-').map(Number) as [number, number];
  return m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`;
};

/** Teto de meses criados de uma vez ao lançar no futuro (evita erro de digitação de ano). */
const MAX_MONTHS_AHEAD = 13;

@Injectable()
export class PeriodService {
  constructor(private readonly audit: AuditService) {}

  async list(condominioId: string): Promise<PeriodDto[]> {
    const { tx } = currentContext();
    const rows = await tx
      .select()
      .from(accountingPeriod)
      .where(eq(accountingPeriod.condominioId, condominioId))
      .orderBy(desc(accountingPeriod.mes));
    return rows.map(toPeriodDto);
  }

  async get(condominioId: string, periodId: string): Promise<PeriodRow> {
    const { tx } = currentContext();
    const [row] = await tx
      .select()
      .from(accountingPeriod)
      .where(
        and(eq(accountingPeriod.id, periodId), eq(accountingPeriod.condominioId, condominioId)),
      );
    if (!row) throw new NotFoundException('Período não encontrado');
    return row;
  }

  async byMonth(condominioId: string, mes: string): Promise<PeriodRow> {
    const { tx } = currentContext();
    const [row] = await tx
      .select()
      .from(accountingPeriod)
      .where(
        and(
          eq(accountingPeriod.condominioId, condominioId),
          eq(accountingPeriod.mes, firstDayOf(mes)),
        ),
      );
    if (!row) throw new NotFoundException(`Não há período contábil em ${mes.slice(0, 7)}`);
    return row;
  }

  /** Primeiro período do condomínio (início da contabilidade). Não audita. */
  async open(condominioId: string, mes: string): Promise<PeriodRow> {
    const { tx, gestoraId } = currentContext();
    if (!gestoraId) throw new Error('Período exige gestora em contexto');
    const [row] = await tx
      .insert(accountingPeriod)
      .values({ gestoraId, condominioId, mes: firstDayOf(mes) })
      .returning();
    if (!row) throw new Error('Falha ao abrir período');
    return row;
  }

  /**
   * Período que recebe um lançamento com data de caixa `dataCaixa` (regime de caixa).
   * - mês aberto: ele mesmo;
   * - mês fechado: o primeiro período aberto depois dele (regra §3.4: o ajuste entra no
   *   período aberto, e o lançamento guarda a data real);
   * - mês ainda inexistente, depois do último: cria os meses que faltam.
   */
  async forCashDate(condominioId: string, dataCaixa: string): Promise<PeriodRow> {
    const { tx } = currentContext();
    const mes = firstDayOf(dataCaixa);
    const [first] = await tx
      .select()
      .from(accountingPeriod)
      .where(eq(accountingPeriod.condominioId, condominioId))
      .orderBy(asc(accountingPeriod.mes))
      .limit(1);
    if (!first) {
      throw new BadRequestException('A contabilidade deste condomínio ainda não foi iniciada');
    }
    if (mes < first.mes) {
      throw new BadRequestException(
        `Data anterior ao início da contabilidade (${first.mes.slice(0, 7)})`,
      );
    }
    const [open] = await tx
      .select()
      .from(accountingPeriod)
      .where(
        and(
          eq(accountingPeriod.condominioId, condominioId),
          gte(accountingPeriod.mes, mes),
          eq(accountingPeriod.status, 'aberto'),
        ),
      )
      .orderBy(asc(accountingPeriod.mes))
      .limit(1);
    if (open) return open;
    return this.createUntil(condominioId, mes);
  }

  /**
   * Fecha o mês: trava o período, grava o SHA-256 dos lançamentos e o status em_revisao.
   * Os meses anteriores precisam estar fechados. O banco confere o hash de novo (trigger).
   */
  async close(condominioId: string, periodId: string): Promise<PeriodDto> {
    const { tx, userId } = currentContext();
    // FOR UPDATE espera lançamentos em andamento (que travam o período FOR SHARE) e
    // impede novos; a consulta seguinte, com snapshot novo, já enxerga todos eles.
    const locked = await tx.execute<{ status: string; mes: string }>(
      sql`SELECT status, mes::text AS mes FROM accounting_period
           WHERE id = ${periodId} AND condominio_id = ${condominioId} FOR UPDATE`,
    );
    const period = locked.rows[0];
    if (!period) throw new NotFoundException('Período não encontrado');
    if (period.status !== 'aberto') throw new ConflictException('Este mês já está fechado');

    const [previousOpen] = await tx
      .select({ mes: accountingPeriod.mes })
      .from(accountingPeriod)
      .where(
        and(
          eq(accountingPeriod.condominioId, condominioId),
          lt(accountingPeriod.mes, period.mes),
          eq(accountingPeriod.status, 'aberto'),
        ),
      )
      .limit(1);
    if (previousOpen) {
      throw new ConflictException(`Feche antes o mês ${previousOpen.mes.slice(0, 7)}`);
    }

    const [closed] = await tx
      .update(accountingPeriod)
      .set({
        status: 'em_revisao',
        hash: sql`ledger_period_hash(${accountingPeriod.id})`,
        fechadoEm: sql`now()`,
        fechadoPor: userId,
      })
      .where(eq(accountingPeriod.id, periodId))
      .returning();
    if (!closed) throw new Error('Falha ao fechar período');
    // O mês seguinte passa a existir aberto, para receber os próximos lançamentos.
    await this.createUntil(condominioId, nextMonth(closed.mes));
    const dto = toPeriodDto(closed);
    await this.audit.record({
      action: 'period.closed',
      resourceType: 'accounting_period',
      resourceId: dto.id,
      after: dto,
    });
    return dto;
  }

  /** Recalcula o hash do período fechado e compara com o gravado. */
  async verify(
    condominioId: string,
    periodId: string,
  ): Promise<{ ok: boolean; hash: string | null }> {
    const period = await this.get(condominioId, periodId);
    if (!period.hash) return { ok: false, hash: null };
    const { tx } = currentContext();
    const result = await tx.execute<{ hash: string }>(
      sql`SELECT ledger_period_hash(${periodId}) AS hash`,
    );
    const current = result.rows[0]?.hash ?? null;
    return { ok: current === period.hash, hash: period.hash };
  }

  /** Cria os meses que faltam até `mes` (inclusive), todos abertos. Devolve o de `mes`. */
  private async createUntil(condominioId: string, mes: string): Promise<PeriodRow> {
    const { tx, gestoraId } = currentContext();
    if (!gestoraId) throw new Error('Período exige gestora em contexto');
    const [last] = await tx
      .select()
      .from(accountingPeriod)
      .where(eq(accountingPeriod.condominioId, condominioId))
      .orderBy(desc(accountingPeriod.mes))
      .limit(1);
    if (!last)
      throw new BadRequestException('A contabilidade deste condomínio ainda não foi iniciada');
    if (last.mes >= mes) return this.byMonth(condominioId, mes);

    const months: string[] = [];
    for (let m = nextMonth(last.mes); m <= mes; m = nextMonth(m)) months.push(m);
    if (months.length > MAX_MONTHS_AHEAD) {
      throw new BadRequestException('Data muito distante do último mês contábil');
    }
    const rows = await tx
      .insert(accountingPeriod)
      .values(months.map((m) => ({ gestoraId, condominioId, mes: m })))
      .onConflictDoNothing()
      .returning();
    return rows.find((r) => r.mes === mes) ?? this.byMonth(condominioId, mes);
  }
}
