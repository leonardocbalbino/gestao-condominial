import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { AccountDto, CreateAccountRequest } from '@condo/contracts';
import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import { isUniqueViolation } from '../../db/errors';
import { currentContext } from '../../db/request-context';
import { account, ACCOUNT_PAPEIS } from '../../db/schema';
import { AuditService } from '../audit/audit.service';
import { DEFAULT_CHART } from './default-chart';

type AccountRow = typeof account.$inferSelect;
export type AccountPapel = (typeof ACCOUNT_PAPEIS)[number];

export const toAccountDto = (row: AccountRow): AccountDto => ({
  id: row.id,
  codigo: row.codigo,
  nome: row.nome,
  natureza: row.natureza,
  grupo: row.grupo,
  analitica: row.analitica,
  caixa: row.caixa,
  papelSistema: row.papelSistema,
  ativa: row.ativa,
});

/** Plano de contas: modelo da gestora (condominio_id nulo) e a cópia de cada condomínio. */
@Injectable()
export class AccountService {
  constructor(private readonly audit: AuditService) {}

  /** Plano do condomínio, ou o modelo da gestora quando `condominioId` é nulo. */
  async list(condominioId: string | null): Promise<AccountDto[]> {
    const { tx } = currentContext();
    if (condominioId === null) await this.ensureTemplate();
    const rows = await tx
      .select()
      .from(account)
      .where(condominioId ? eq(account.condominioId, condominioId) : isNull(account.condominioId))
      .orderBy(sql`string_to_array(${account.codigo}, '.')::int[]`);
    return rows.map(toAccountDto);
  }

  /** Acrescenta conta ao modelo da gestora (`condominioId` nulo) ou ao plano do condomínio. */
  async create(condominioId: string | null, input: CreateAccountRequest): Promise<AccountDto> {
    const { tx, gestoraId } = currentContext();
    if (!gestoraId) throw new Error('Plano de contas exige gestora em contexto');
    if (condominioId === null) await this.ensureTemplate();
    await this.assertParentAccepts(condominioId, input);
    let row: AccountRow | undefined;
    try {
      [row] = await tx
        .insert(account)
        .values({
          gestoraId,
          condominioId,
          codigo: input.codigo,
          nome: input.nome,
          natureza: input.natureza,
          grupo: input.grupo ?? null,
          analitica: input.analitica,
        })
        .returning();
    } catch (error) {
      if (isUniqueViolation(error)) throw new ConflictException('Já existe conta com este código');
      throw error;
    }
    if (!row) throw new Error('Falha ao criar conta');
    const dto = toAccountDto(row);
    await this.audit.record({
      action: 'account.created',
      resourceType: 'account',
      resourceId: dto.id,
      after: { ...dto, condominioId },
    });
    return dto;
  }

  /** Copia o modelo da gestora para o condomínio (início da contabilidade). Não audita. */
  async copyTemplateTo(condominioId: string): Promise<void> {
    const { tx, gestoraId } = currentContext();
    if (!gestoraId) throw new Error('Plano de contas exige gestora em contexto');
    await this.ensureTemplate();
    const [existing] = await tx
      .select({ id: account.id })
      .from(account)
      .where(eq(account.condominioId, condominioId))
      .limit(1);
    if (existing) throw new ConflictException('A contabilidade deste condomínio já foi iniciada');
    await tx.execute(sql`
      INSERT INTO account (gestora_id, condominio_id, codigo, nome, natureza, grupo, analitica, caixa, papel_sistema, ativa)
      SELECT gestora_id, ${condominioId}, codigo, nome, natureza, grupo, analitica, caixa, papel_sistema, ativa
        FROM account WHERE gestora_id = ${gestoraId} AND condominio_id IS NULL`);
  }

  /** Conta do condomínio com o papel dado (ex.: 'banco'). Usada pelas automações. */
  async byPapel(condominioId: string, papel: AccountPapel): Promise<AccountDto> {
    const { tx } = currentContext();
    const [row] = await tx
      .select()
      .from(account)
      .where(and(eq(account.condominioId, condominioId), eq(account.papelSistema, papel)));
    if (!row) {
      throw new BadRequestException(
        `Plano de contas do condomínio sem conta de papel "${papel}". Inicie a contabilidade.`,
      );
    }
    return toAccountDto(row);
  }

  async getMany(condominioId: string, ids: string[]): Promise<AccountDto[]> {
    if (ids.length === 0) return [];
    const { tx } = currentContext();
    const rows = await tx
      .select()
      .from(account)
      .where(and(eq(account.condominioId, condominioId), inArray(account.id, ids)));
    return rows.map(toAccountDto);
  }

  /** O modelo da gestora nasce do plano padrão na primeira vez em que é usado. */
  private async ensureTemplate(): Promise<void> {
    const { tx, gestoraId } = currentContext();
    if (!gestoraId) throw new Error('Plano de contas exige gestora em contexto');
    const [existing] = await tx
      .select({ id: account.id })
      .from(account)
      .where(and(eq(account.gestoraId, gestoraId), isNull(account.condominioId)))
      .limit(1);
    if (existing) return;
    await tx
      .insert(account)
      .values(DEFAULT_CHART.map((a) => ({ ...a, gestoraId, condominioId: null })))
      .onConflictDoNothing();
  }

  /** A conta nova precisa de uma conta-mãe sintética da mesma natureza (ex.: 4.3 para 4.3.06). */
  private async assertParentAccepts(
    condominioId: string | null,
    input: CreateAccountRequest,
  ): Promise<void> {
    const parentCode = input.codigo.split('.').slice(0, -1).join('.');
    if (!parentCode) return;
    const { tx } = currentContext();
    const [parent] = await tx
      .select()
      .from(account)
      .where(
        and(
          eq(account.codigo, parentCode),
          condominioId ? eq(account.condominioId, condominioId) : isNull(account.condominioId),
        ),
      );
    if (!parent) throw new NotFoundException(`Conta-mãe ${parentCode} não encontrada`);
    if (parent.analitica || parent.natureza !== input.natureza) {
      throw new BadRequestException(
        `A conta-mãe ${parentCode} precisa ser sintética e da mesma natureza`,
      );
    }
  }
}
