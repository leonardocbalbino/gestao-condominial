import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import {
  UNIT_GRANT_PERMISSIONS,
  type CreateOwnerGrantRequest,
  type PersonDto,
  type UnitGrantDto,
  type UnitGrantPermission,
} from '@condo/contracts';
import { and, asc, eq, isNull, sql } from 'drizzle-orm';
import { isUniqueViolation } from '../../db/errors';
import { currentContext } from '../../db/request-context';
import { unitAccessGrant } from '../../db/schema';
import { AuditService } from '../audit/audit.service';
import { PersonService } from '../org/person.service';
import { UnitService } from '../org/unit.service';
import { MagicLinkService } from './magic-link.service';
import { RolesService } from './roles.service';
import { UsersService } from './users.service';

type GrantRow = typeof unitAccessGrant.$inferSelect;

const toDto = (row: GrantRow): UnitGrantDto => ({
  id: row.id,
  unitId: row.unitId,
  personId: row.personId,
  perfil: row.perfil,
  permissoes: row.permissoes as UnitGrantPermission[],
  inicio: row.inicio.toISOString(),
  fim: row.fim?.toISOString() ?? null,
});

export interface UnitGrantWithPerson extends UnitGrantDto {
  pessoa: PersonDto;
}

/**
 * Dono de unit_access_grant. Cada vínculo ativo tem um papel 'morador' no escopo da
 * unidade (g.c.u), e é isso que o can() enxerga: o morador só alcança a própria unidade.
 */
@Injectable()
export class UnitAccessService {
  constructor(
    private readonly units: UnitService,
    private readonly persons: PersonService,
    private readonly users: UsersService,
    private readonly roles: RolesService,
    private readonly magicLinks: MagicLinkService,
    private readonly audit: AuditService,
  ) {}

  async list(condominioId: string, unitId: string): Promise<UnitGrantWithPerson[]> {
    await this.units.get(condominioId, unitId);
    const { tx } = currentContext();
    const rows = await tx
      .select()
      .from(unitAccessGrant)
      .where(
        and(
          eq(unitAccessGrant.condominioId, condominioId),
          eq(unitAccessGrant.unitId, unitId),
          isNull(unitAccessGrant.revogadoEm),
        ),
      )
      .orderBy(asc(unitAccessGrant.createdAt));
    const people = new Map(
      (await this.persons.getMany(rows.map((r) => r.personId))).map((p) => [p.id, p]),
    );
    return rows.flatMap((row) => {
      const pessoa = people.get(row.personId);
      return pessoa ? [{ ...toDto(row), pessoa }] : [];
    });
  }

  /** Cadastra o proprietário: pessoa (reaproveitada se já existe) + login + papel + convite. */
  async addOwner(
    condominioId: string,
    unitId: string,
    input: CreateOwnerGrantRequest,
  ): Promise<UnitGrantWithPerson> {
    await this.units.get(condominioId, unitId);
    const { tx, gestoraId, userId: actorId } = currentContext();
    if (!gestoraId) throw new Error('Vínculo com unidade exige gestora em contexto');

    const user = await this.users.findOrCreateByEmail(input.email);
    const { person } = await this.persons.findOrCreateForUser(input, user.id);
    const assignment = await this.roles.assignMoradorToUnit({
      userId: user.id,
      condominioId,
      unitId,
    });

    let row: GrantRow | undefined;
    try {
      [row] = await tx
        .insert(unitAccessGrant)
        .values({
          gestoraId,
          condominioId,
          unitId,
          personId: person.id,
          perfil: 'proprietario',
          // Proprietário vê tudo da unidade (§7).
          permissoes: [...UNIT_GRANT_PERMISSIONS],
          roleAssignmentId: assignment.id,
          concedidoPor: actorId,
        })
        .returning();
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException('Esta pessoa já tem acesso a esta unidade');
      }
      throw error;
    }
    if (!row) throw new Error('Falha ao criar vínculo');

    await this.magicLinks.issue(user.id, user.email, 'invite');
    const dto = { ...toDto(row), pessoa: person };
    await this.audit.record({
      action: 'unit_grant.created',
      resourceType: 'unit_access_grant',
      resourceId: dto.id,
      after: dto,
    });
    return dto;
  }

  /** Encerra o vínculo e o papel de morador ligado a ele (efeito imediato no can()). */
  async revoke(condominioId: string, unitId: string, grantId: string): Promise<void> {
    const { tx } = currentContext();
    const [row] = await tx
      .update(unitAccessGrant)
      .set({ revogadoEm: sql`now()` })
      .where(
        and(
          eq(unitAccessGrant.id, grantId),
          eq(unitAccessGrant.condominioId, condominioId),
          eq(unitAccessGrant.unitId, unitId),
          isNull(unitAccessGrant.revogadoEm),
        ),
      )
      .returning();
    if (!row) throw new NotFoundException('Vínculo não encontrado');
    if (row.roleAssignmentId) await this.roles.revokeAssignment(row.roleAssignmentId);
    await this.audit.record({
      action: 'unit_grant.revoked',
      resourceType: 'unit_access_grant',
      resourceId: grantId,
      before: toDto(row),
    });
  }
}
