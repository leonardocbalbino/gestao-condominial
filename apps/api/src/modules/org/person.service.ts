import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { maskCpf, type CreatePersonRequest, type PersonDto } from '@condo/contracts';
import { asc, eq, inArray, isNull, and } from 'drizzle-orm';
import { isUniqueViolation } from '../../db/errors';
import { currentContext } from '../../db/request-context';
import { person } from '../../db/schema';
import { AuditService } from '../audit/audit.service';

type PersonRow = typeof person.$inferSelect;

export interface CreatePersonInput {
  gestoraId: string;
  userId: string | null;
  nome: string;
  email: string | null;
}

/** CPF nunca sai deste serviço sem máscara (LGPD). */
const toDto = (row: PersonRow): PersonDto => ({
  id: row.id,
  nome: row.nome,
  cpfMascarado: row.cpf ? maskCpf(row.cpf) : null,
  email: row.email,
  telefone: row.telefone,
  temAcesso: row.userId !== null,
});

@Injectable()
export class PersonService {
  constructor(private readonly audit: AuditService) {}

  /** Cria a pessoa na gestora; se o usuário já tem cadastro nela, mantém o existente. */
  async ensure(input: CreatePersonInput): Promise<void> {
    const { tx } = currentContext();
    await tx.insert(person).values(input).onConflictDoNothing();
  }

  async list(): Promise<PersonDto[]> {
    const { tx } = currentContext();
    const rows = await tx.select().from(person).orderBy(asc(person.nome));
    return rows.map(toDto);
  }

  async getMany(ids: string[]): Promise<PersonDto[]> {
    if (ids.length === 0) return [];
    const { tx } = currentContext();
    const rows = await tx.select().from(person).where(inArray(person.id, ids));
    return rows.map(toDto);
  }

  async create(input: CreatePersonRequest): Promise<PersonDto> {
    const dto = await this.insert(input, null);
    await this.audit.record({
      action: 'person.created',
      resourceType: 'person',
      resourceId: dto.id,
      after: dto,
    });
    return dto;
  }

  /**
   * Encontra a pessoa da gestora ligada ao login, ao CPF ou ao e-mail (nesta ordem), ou
   * cria uma nova já ligada ao login. Não audita: quem chama audita a operação completa.
   * `created` indica se o cadastro é novo.
   */
  async findOrCreateForUser(
    input: CreatePersonRequest & { email: string },
    userId: string,
  ): Promise<{ person: PersonDto; created: boolean }> {
    const { tx } = currentContext();
    const candidates = [
      eq(person.userId, userId),
      ...(input.cpf ? [eq(person.cpf, input.cpf)] : []),
      eq(person.email, input.email),
    ];
    for (const condition of candidates) {
      const [row] = await tx.select().from(person).where(condition).limit(1);
      if (!row) continue;
      if (row.userId && row.userId !== userId) {
        throw new ConflictException('Este cadastro já está ligado a outro e-mail de acesso');
      }
      if (!row.userId) {
        await tx
          .update(person)
          .set({ userId })
          .where(and(eq(person.id, row.id), isNull(person.userId)));
      }
      return { person: toDto({ ...row, userId }), created: false };
    }
    return { person: await this.insert(input, userId), created: true };
  }

  /**
   * Dados do pagador para o broker (CPF sem máscara). Uso interno do sistema na emissão
   * da cobrança; nunca exposto pela API.
   */
  async billingData(
    ids: string[],
  ): Promise<Map<string, { nome: string; cpf: string | null; email: string | null }>> {
    if (ids.length === 0) return new Map();
    const { tx } = currentContext();
    const rows = await tx
      .select({ id: person.id, nome: person.nome, cpf: person.cpf, email: person.email })
      .from(person)
      .where(inArray(person.id, ids));
    return new Map(rows.map((r) => [r.id, { nome: r.nome, cpf: r.cpf, email: r.email }]));
  }

  /** Nomes das pessoas desta gestora ligadas aos logins informados (userId → nome). */
  async namesByUserIds(userIds: string[]): Promise<Map<string, string>> {
    if (userIds.length === 0) return new Map();
    const { tx } = currentContext();
    const rows = await tx
      .select({ userId: person.userId, nome: person.nome })
      .from(person)
      .where(inArray(person.userId, userIds));
    return new Map(rows.flatMap((r) => (r.userId ? [[r.userId, r.nome] as const] : [])));
  }

  /** Nome da pessoa ligada ao login da requisição, nesta gestora. */
  async nameOfCurrentUser(): Promise<string | null> {
    const { tx, userId } = currentContext();
    if (!userId) return null;
    const [row] = await tx
      .select({ nome: person.nome })
      .from(person)
      .where(eq(person.userId, userId))
      .limit(1);
    return row?.nome ?? null;
  }

  async get(id: string): Promise<PersonDto> {
    const { tx } = currentContext();
    const [row] = await tx.select().from(person).where(eq(person.id, id));
    if (!row) throw new NotFoundException('Pessoa não encontrada');
    return toDto(row);
  }

  private async insert(input: CreatePersonRequest, userId: string | null): Promise<PersonDto> {
    const { tx, gestoraId } = currentContext();
    if (!gestoraId) throw new Error('Cadastro de pessoa exige gestora em contexto');
    try {
      const [row] = await tx
        .insert(person)
        .values({
          gestoraId,
          userId,
          nome: input.nome,
          cpf: input.cpf ?? null,
          email: input.email ?? null,
          telefone: input.telefone ?? null,
        })
        .returning();
      if (!row) throw new Error('Falha ao cadastrar pessoa');
      return toDto(row);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException('Já existe uma pessoa com este CPF na gestora');
      }
      throw error;
    }
  }
}
