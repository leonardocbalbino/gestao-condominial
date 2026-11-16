import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { CondominioDto, CreateCondominioRequest } from '@condo/contracts';
import { asc, eq, sql } from 'drizzle-orm';
import { isUniqueViolation } from '../../db/errors';
import { currentContext } from '../../db/request-context';
import { condominio } from '../../db/schema';
import { AuditService } from '../audit/audit.service';

const toDto = (row: typeof condominio.$inferSelect): CondominioDto => ({
  id: row.id,
  gestoraId: row.gestoraId,
  nome: row.nome,
  cnpj: row.cnpj,
});

@Injectable()
export class CondominioService {
  constructor(private readonly audit: AuditService) {}

  async create(input: CreateCondominioRequest): Promise<CondominioDto> {
    const { tx, gestoraId } = currentContext();
    if (!gestoraId) throw new Error('Criação de condomínio exige gestora em contexto');
    let row: typeof condominio.$inferSelect | undefined;
    try {
      [row] = await tx
        .insert(condominio)
        .values({ ...input, gestoraId })
        .returning();
    } catch (error) {
      if (isUniqueViolation(error))
        throw new ConflictException('Já existe um condomínio com este CNPJ');
      throw error;
    }
    if (!row) throw new Error('Falha ao criar condomínio');
    const dto = toDto(row);
    await this.audit.record({
      action: 'condominio.created',
      resourceType: 'condominio',
      resourceId: dto.id,
      after: dto,
    });
    return dto;
  }

  /** Condomínios dentro dos escopos onde o usuário tem a permissão da rota. */
  async listAccessible(): Promise<CondominioDto[]> {
    const { tx, permissionScopes } = currentContext();
    if (permissionScopes.length === 0) return [];
    const scopes = sql.join(
      permissionScopes.map((s) => sql`${s}::ltree`),
      sql`, `,
    );
    const rows = await tx
      .select()
      .from(condominio)
      .where(sql`${condominio.path} <@ ANY(ARRAY[${scopes}])`)
      .orderBy(asc(condominio.nome));
    return rows.map(toDto);
  }

  async get(id: string): Promise<CondominioDto> {
    const { tx } = currentContext();
    const [row] = await tx.select().from(condominio).where(eq(condominio.id, id));
    if (!row) throw new NotFoundException('Condomínio não encontrado');
    return toDto(row);
  }

  /** RLS: condomínio de outra gestora simplesmente não existe aqui. */
  async assertExists(id: string): Promise<void> {
    if (!(await this.exists(id))) throw new NotFoundException('Condomínio não encontrado');
  }

  async exists(id: string): Promise<boolean> {
    const { tx } = currentContext();
    const [row] = await tx
      .select({ id: condominio.id })
      .from(condominio)
      .where(eq(condominio.id, id));
    return Boolean(row);
  }
}
