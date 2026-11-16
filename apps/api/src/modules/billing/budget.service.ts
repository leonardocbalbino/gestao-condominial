import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { BudgetDto, CreateBudgetRequest } from '@condo/contracts';
import { and, desc, eq, sql } from 'drizzle-orm';
import { isUniqueViolation } from '../../db/errors';
import { currentContext } from '../../db/request-context';
import { budget, budgetLine } from '../../db/schema';
import { AuditService } from '../audit/audit.service';
import { AccountService } from '../ledger/account.service';

type BudgetRow = typeof budget.$inferSelect;

/**
 * Orçamento anual: previsão mensal por conta de despesa ordinária e o critério de rateio
 * de cada linha. Aprovado, vira a base do rateio do ano e não muda mais.
 */
@Injectable()
export class BudgetService {
  constructor(
    private readonly accounts: AccountService,
    private readonly audit: AuditService,
  ) {}

  async list(condominioId: string): Promise<BudgetDto[]> {
    const { tx } = currentContext();
    const rows = await tx
      .select()
      .from(budget)
      .where(eq(budget.condominioId, condominioId))
      .orderBy(desc(budget.ano));
    return Promise.all(rows.map((r) => this.toDto(condominioId, r)));
  }

  async create(condominioId: string, input: CreateBudgetRequest): Promise<BudgetDto> {
    const { tx, gestoraId } = currentContext();
    if (!gestoraId) throw new Error('Orçamento exige gestora em contexto');
    const accounts = await this.accounts.getMany(
      condominioId,
      input.linhas.map((l) => l.accountId),
    );
    for (const line of input.linhas) {
      const acc = accounts.find((a) => a.id === line.accountId);
      if (!acc) throw new BadRequestException('Conta não pertence a este condomínio');
      // O fundo de reserva vem do percentual sobre a taxa; obras terão cobrança própria.
      if (acc.natureza !== 'despesa' || acc.grupo !== 'ordinaria' || !acc.analitica) {
        throw new BadRequestException(
          `A conta ${acc.codigo} não é uma despesa ordinária analítica`,
        );
      }
    }

    let row: BudgetRow | undefined;
    try {
      [row] = await tx
        .insert(budget)
        .values({ gestoraId, condominioId, ano: input.ano })
        .returning();
    } catch (error) {
      if (isUniqueViolation(error))
        throw new ConflictException(`Já existe orçamento de ${input.ano}`);
      throw error;
    }
    if (!row) throw new Error('Falha ao criar orçamento');
    const budgetId = row.id;
    await tx.insert(budgetLine).values(
      input.linhas.map((l) => ({
        gestoraId,
        condominioId,
        budgetId,
        accountId: l.accountId,
        valorMensalCentavos: l.valorMensalCentavos,
        criterio: l.criterio,
      })),
    );
    const dto = await this.toDto(condominioId, row);
    await this.audit.record({
      action: 'budget.created',
      resourceType: 'budget',
      resourceId: dto.id,
      after: dto,
    });
    return dto;
  }

  async approve(condominioId: string, budgetId: string): Promise<BudgetDto> {
    const { tx, userId } = currentContext();
    const [row] = await tx
      .update(budget)
      .set({ status: 'aprovado', aprovadoEm: sql`now()`, aprovadoPor: userId })
      .where(
        and(
          eq(budget.id, budgetId),
          eq(budget.condominioId, condominioId),
          eq(budget.status, 'rascunho'),
        ),
      )
      .returning();
    if (!row) throw new NotFoundException('Orçamento em rascunho não encontrado');
    const dto = await this.toDto(condominioId, row);
    await this.audit.record({
      action: 'budget.approved',
      resourceType: 'budget',
      resourceId: dto.id,
      after: dto,
    });
    return dto;
  }

  /** Orçamento aprovado do ano (base do rateio). */
  async approvedFor(condominioId: string, ano: number): Promise<BudgetDto> {
    const { tx } = currentContext();
    const [row] = await tx
      .select()
      .from(budget)
      .where(
        and(
          eq(budget.condominioId, condominioId),
          eq(budget.ano, ano),
          eq(budget.status, 'aprovado'),
        ),
      );
    if (!row) throw new BadRequestException(`Não há orçamento aprovado para ${ano}`);
    return this.toDto(condominioId, row);
  }

  private async toDto(condominioId: string, row: BudgetRow): Promise<BudgetDto> {
    const { tx } = currentContext();
    const lines = await tx.select().from(budgetLine).where(eq(budgetLine.budgetId, row.id));
    const accounts = new Map(
      (
        await this.accounts.getMany(
          condominioId,
          lines.map((l) => l.accountId),
        )
      ).map((a) => [a.id, a]),
    );
    const linhas = lines
      .map((l) => ({
        accountId: l.accountId,
        codigo: accounts.get(l.accountId)?.codigo ?? '',
        conta: accounts.get(l.accountId)?.nome ?? '',
        valorMensalCentavos: l.valorMensalCentavos,
        criterio: l.criterio,
      }))
      .sort((a, b) => a.codigo.localeCompare(b.codigo, 'pt-BR', { numeric: true }));
    return {
      id: row.id,
      ano: row.ano,
      status: row.status,
      totalMensalCentavos: linhas.reduce((acc, l) => acc + l.valorMensalCentavos, 0),
      linhas,
    };
  }
}
