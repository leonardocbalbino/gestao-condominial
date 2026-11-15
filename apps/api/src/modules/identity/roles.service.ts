import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  CreateRoleAssignmentRequest,
  CreateRoleRequest,
  PermissionKey,
  RoleAssignmentDto,
  RoleDto,
  RoleScope,
} from '@condo/contracts';
import { and, asc, eq, gt, inArray, isNull, or, sql } from 'drizzle-orm';
import { isUniqueViolation } from '../../db/errors';
import { currentContext } from '../../db/request-context';
import { role, roleAssignment, rolePermission } from '../../db/schema';
import { AuditService } from '../audit/audit.service';
import { CondominioService } from '../org/condominio.service';
import { AuthorizationService, type AuthorizationTarget } from './authorization.service';
import { condominioScope, gestoraScope } from './scope';
import { UsersService } from './users.service';

type RoleRow = typeof role.$inferSelect;

export interface UserAssignment {
  gestoraId: string;
  roleKey: string;
  roleName: string;
  scope: RoleScope;
}

/** Converte o caminho ltree de volta para o escopo do contrato. */
function scopeFromPath(path: string): RoleScope {
  const [, condominio] = path.split('.');
  if (!condominio) return { type: 'gestora' };
  const hex = condominio.slice(1);
  const condominioId = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  return { type: 'condominio', condominioId };
}

@Injectable()
export class RolesService {
  constructor(
    private readonly authz: AuthorizationService,
    private readonly audit: AuditService,
    private readonly users: UsersService,
    private readonly condominios: CondominioService,
  ) {}

  /** Papéis de sistema + papéis customizados da gestora em contexto. */
  async list(): Promise<RoleDto[]> {
    const { tx, gestoraId } = currentContext();
    const roles = await tx
      .select()
      .from(role)
      .where(or(isNull(role.gestoraId), gestoraId ? eq(role.gestoraId, gestoraId) : sql`false`))
      .orderBy(asc(role.name));
    return this.withPermissions(roles);
  }

  async create(input: CreateRoleRequest): Promise<RoleDto> {
    const { tx, gestoraId } = currentContext();
    if (!gestoraId) throw new Error('Criação de papel exige gestora em contexto');
    // Ninguém cria papel com permissão que não tem: impede escalar privilégio.
    if (!(await this.authz.holdsAll(input.permissions, { gestoraId }))) {
      throw new ForbiddenException('O papel inclui permissões que você não possui');
    }

    let created: RoleRow | undefined;
    try {
      [created] = await tx
        .insert(role)
        .values({ gestoraId, key: input.key, name: input.name, requiresMfa: input.requiresMfa })
        .returning();
    } catch (error) {
      if (isUniqueViolation(error))
        throw new ConflictException('Já existe um papel com esta chave');
      throw error;
    }
    if (!created) throw new Error('Falha ao criar papel');
    const roleId = created.id;
    await tx
      .insert(rolePermission)
      .values(input.permissions.map((permissionKey) => ({ roleId, permissionKey, gestoraId })));

    const [dto] = await this.withPermissions([created]);
    if (!dto) throw new Error('Falha ao montar papel');
    await this.audit.record({
      action: 'role.created',
      resourceType: 'role',
      resourceId: dto.id,
      after: dto,
    });
    return dto;
  }

  async assign(input: CreateRoleAssignmentRequest): Promise<RoleAssignmentDto> {
    const { gestoraId, userId: actorId } = currentContext();
    if (!gestoraId) throw new Error('Atribuição de papel exige gestora em contexto');

    const target = await this.resolveTarget(gestoraId, input.scope);
    const roleRow = await this.findAssignableRole(input.roleId, gestoraId);
    if (!(await this.authz.can('role:manage', target))) throw new ForbiddenException();
    const permissions = await this.permissionsOf(roleRow.id);
    if (!(await this.authz.holdsAll(permissions, target))) {
      throw new ForbiddenException('O papel inclui permissões que você não possui neste escopo');
    }
    if (!(await this.users.findById(input.userId)))
      throw new NotFoundException('Usuário não encontrado');

    const dto = await this.insertAssignment({
      gestoraId,
      userId: input.userId,
      role: roleRow,
      scope: input.scope,
      validFrom: input.validFrom,
      validUntil: input.validUntil,
      grantedBy: actorId,
    });
    await this.audit.record({
      action: 'role_assignment.created',
      resourceType: 'role_assignment',
      resourceId: dto.id,
      after: dto,
    });
    return dto;
  }

  /**
   * Atribuição feita pelo caminho de plataforma (ex.: primeiro admin de uma nova gestora).
   * A autorização já foi feita (super admin + 2FA); quem chama audita a operação completa.
   */
  async assignSystemRoleAsPlatform(
    gestoraId: string,
    userId: string,
    roleKey: string,
  ): Promise<RoleAssignmentDto> {
    const { tx, userId: actorId } = currentContext();
    const [roleRow] = await tx
      .select()
      .from(role)
      .where(and(isNull(role.gestoraId), eq(role.key, roleKey)));
    if (!roleRow) throw new Error(`Papel de sistema inexistente: ${roleKey}`);
    return this.insertAssignment({
      gestoraId,
      userId,
      role: roleRow,
      scope: { type: 'gestora' },
      grantedBy: actorId,
    });
  }

  /** Atribuições ativas do usuário em todas as gestoras (política RLS "self"). */
  async activeAssignmentsOfCurrentUser(): Promise<UserAssignment[]> {
    const { tx, userId } = currentContext();
    if (!userId) return [];
    const rows = await tx
      .select({
        gestoraId: roleAssignment.gestoraId,
        scopePath: roleAssignment.scopePath,
        roleKey: role.key,
        roleName: role.name,
      })
      .from(roleAssignment)
      .innerJoin(role, eq(role.id, roleAssignment.roleId))
      .where(
        and(
          eq(roleAssignment.userId, userId),
          isNull(roleAssignment.revokedAt),
          sql`${roleAssignment.validFrom} <= now()`,
          or(isNull(roleAssignment.validUntil), gt(roleAssignment.validUntil, sql`now()`)),
        ),
      );
    return rows.map((r) => ({
      gestoraId: r.gestoraId,
      roleKey: r.roleKey,
      roleName: r.roleName,
      scope: scopeFromPath(r.scopePath),
    }));
  }

  private async resolveTarget(gestoraId: string, scope: RoleScope): Promise<AuthorizationTarget> {
    if (scope.type === 'gestora') return { gestoraId };
    // RLS: condomínio de outra gestora simplesmente não existe aqui.
    if (!(await this.condominios.exists(scope.condominioId)))
      throw new NotFoundException('Condomínio não encontrado');
    return { gestoraId, condominioId: scope.condominioId };
  }

  private async findAssignableRole(roleId: string, gestoraId: string): Promise<RoleRow> {
    const { tx } = currentContext();
    // Filtro explícito: a política "self" do RLS também mostra papéis de outra gestora
    // onde o próprio usuário atua; esses não podem ser atribuídos aqui.
    const [row] = await tx
      .select()
      .from(role)
      .where(and(eq(role.id, roleId), or(isNull(role.gestoraId), eq(role.gestoraId, gestoraId))));
    if (!row) throw new NotFoundException('Papel não encontrado');
    return row;
  }

  private async permissionsOf(roleId: string): Promise<PermissionKey[]> {
    const { tx } = currentContext();
    const rows = await tx
      .select({ key: rolePermission.permissionKey })
      .from(rolePermission)
      .where(eq(rolePermission.roleId, roleId));
    return rows.map((r) => r.key as PermissionKey);
  }

  private async insertAssignment(input: {
    gestoraId: string;
    userId: string;
    role: RoleRow;
    scope: RoleScope;
    validFrom?: Date | undefined;
    validUntil?: Date | undefined;
    grantedBy: string | null;
  }): Promise<RoleAssignmentDto> {
    const { tx } = currentContext();
    const scopePath =
      input.scope.type === 'gestora'
        ? gestoraScope(input.gestoraId)
        : condominioScope(input.gestoraId, input.scope.condominioId);
    const [row] = await tx
      .insert(roleAssignment)
      .values({
        gestoraId: input.gestoraId,
        userId: input.userId,
        roleId: input.role.id,
        scopePath,
        requiresMfa: input.role.requiresMfa,
        ...(input.validFrom ? { validFrom: input.validFrom } : {}),
        validUntil: input.validUntil ?? null,
        grantedBy: input.grantedBy,
      })
      .returning();
    if (!row) throw new Error('Falha ao criar atribuição');
    return {
      id: row.id,
      userId: row.userId,
      roleId: row.roleId,
      scope: input.scope,
      validFrom: row.validFrom.toISOString(),
      validUntil: row.validUntil?.toISOString() ?? null,
    };
  }

  private async withPermissions(roles: RoleRow[]): Promise<RoleDto[]> {
    if (roles.length === 0) return [];
    const { tx } = currentContext();
    const perms = await tx
      .select()
      .from(rolePermission)
      .where(
        inArray(
          rolePermission.roleId,
          roles.map((r) => r.id),
        ),
      );
    return roles.map((r) => ({
      id: r.id,
      key: r.key,
      name: r.name,
      requiresMfa: r.requiresMfa,
      system: r.gestoraId === null,
      permissions: perms
        .filter((p) => p.roleId === r.id)
        .map((p) => p.permissionKey as PermissionKey),
    }));
  }
}
