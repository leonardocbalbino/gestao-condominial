import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  AssignedScope,
  CreateRoleAssignmentRequest,
  CreateRoleRequest,
  InviteCondominioStaffRequest,
  PermissionKey,
  RoleAssignmentDto,
  RoleDto,
  RoleScope,
  StaffInviteDto,
} from '@condo/contracts';
import { DELEGABLE_WITHOUT_HOLDING } from '@condo/contracts';
import { and, asc, desc, eq, gt, inArray, isNull, or, sql } from 'drizzle-orm';
import { isUniqueViolation } from '../../db/errors';
import { currentContext } from '../../db/request-context';
import { role, roleAssignment, rolePermission } from '../../db/schema';
import { AuditService } from '../audit/audit.service';
import { CondominioService } from '../org/condominio.service';
import { PersonService } from '../org/person.service';
import { MagicLinkService } from './magic-link.service';
import { AuthorizationService, type AuthorizationTarget } from './authorization.service';
import { condominioScope, gestoraScope, parseScope, unitScope } from './scope';
import { UsersService } from './users.service';

type RoleRow = typeof role.$inferSelect;

/** Papéis convidados pela Visão geral do condomínio. */
const STAFF_INVITE_ROLES = ['sindico', 'conselheiro'] as const;

export interface UserAssignment {
  gestoraId: string;
  roleKey: string;
  roleName: string;
  scope: AssignedScope;
}

/** Permissões que quem delega precisa possuir (as de aprovação são delegáveis sem possuir). */
const mustHold = (permissions: readonly PermissionKey[]): PermissionKey[] =>
  permissions.filter((p) => !DELEGABLE_WITHOUT_HOLDING.includes(p));

/** Converte o caminho ltree de volta para o escopo do contrato. */
function scopeFromPath(path: string): AssignedScope {
  const { condominioId, unitId } = parseScope(path);
  if (condominioId && unitId) return { type: 'unit', condominioId, unitId };
  if (condominioId) return { type: 'condominio', condominioId };
  return { type: 'gestora' };
}

@Injectable()
export class RolesService {
  constructor(
    private readonly authz: AuthorizationService,
    private readonly audit: AuditService,
    private readonly users: UsersService,
    private readonly condominios: CondominioService,
    private readonly persons: PersonService,
    private readonly magicLinks: MagicLinkService,
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
    if (!(await this.authz.holdsAll(mustHold(input.permissions), { gestoraId }))) {
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
    // O papel de morador vale só no escopo de uma unidade: nasce do vínculo com a unidade.
    if (roleRow.gestoraId === null && roleRow.key === 'morador') {
      throw new BadRequestException('Morador é vinculado pela unidade, não por atribuição direta');
    }
    if (!(await this.authz.can('role:manage', target))) throw new ForbiddenException();
    // Sem auto-atribuição: senão quem delega aprovação poderia se dar o poder de aprovar.
    if (input.userId === actorId) {
      throw new ForbiddenException('Você não pode atribuir papéis a si mesmo');
    }
    const permissions = await this.permissionsOf(roleRow.id);
    if (!(await this.authz.holdsAll(mustHold(permissions), target))) {
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

  /**
   * Convida síndico ou conselheiro: cria o login se preciso, registra a pessoa na gestora,
   * atribui o papel no escopo do condomínio e envia o link de acesso (o 2FA é configurado
   * no primeiro acesso). Mesmas regras de /role-assignments: role:manage no escopo e nada
   * de atribuir papel a si mesmo.
   */
  async inviteCondominioStaff(
    condominioId: string,
    input: InviteCondominioStaffRequest,
  ): Promise<RoleAssignmentDto> {
    const { tx, gestoraId, userId: actorId } = currentContext();
    if (!gestoraId) throw new Error('Convite exige gestora em contexto');
    const target = await this.resolveTarget(gestoraId, { type: 'condominio', condominioId });
    const [roleRow] = await tx
      .select()
      .from(role)
      .where(and(isNull(role.gestoraId), eq(role.key, input.papel)));
    if (!roleRow) throw new Error(`Papel de sistema inexistente: ${input.papel}`);
    if (!(await this.authz.holdsAll(mustHold(await this.permissionsOf(roleRow.id)), target))) {
      throw new ForbiddenException('O papel inclui permissões que você não possui neste escopo');
    }

    const user = await this.users.findOrCreateByEmail(input.email);
    if (user.id === actorId)
      throw new ForbiddenException('Você não pode atribuir papéis a si mesmo');
    await this.persons.ensure({ gestoraId, userId: user.id, nome: input.nome, email: user.email });
    const dto = await this.insertAssignment({
      gestoraId,
      userId: user.id,
      role: roleRow,
      scope: { type: 'condominio', condominioId },
      grantedBy: actorId,
    });
    await this.magicLinks.issue(user.id, user.email, 'invite');
    await this.audit.record({
      action: 'role_assignment.invited',
      resourceType: 'role_assignment',
      resourceId: dto.id,
      after: { ...dto, papel: input.papel },
    });
    return dto;
  }

  /**
   * Síndicos e conselheiros do condomínio (atribuições ativas no escopo dele, mais
   * recentes primeiro). Aceito = a pessoa já entrou e configurou o 2FA, obrigatório no
   * primeiro acesso desses papéis.
   */
  async listCondominioStaff(condominioId: string): Promise<StaffInviteDto[]> {
    const { tx, gestoraId } = currentContext();
    if (!gestoraId) throw new Error('Lista de equipe exige gestora em contexto');
    const rows = await tx
      .select({
        id: roleAssignment.id,
        userId: roleAssignment.userId,
        createdAt: roleAssignment.createdAt,
        papel: role.key,
        papelNome: role.name,
      })
      .from(roleAssignment)
      .innerJoin(role, eq(role.id, roleAssignment.roleId))
      .where(
        and(
          sql`${roleAssignment.scopePath} = ${condominioScope(gestoraId, condominioId)}::ltree`,
          isNull(roleAssignment.revokedAt),
          inArray(role.key, [...STAFF_INVITE_ROLES]),
        ),
      )
      .orderBy(desc(roleAssignment.createdAt));
    const userIds = [...new Set(rows.map((r) => r.userId))];
    const users = new Map((await this.users.findMany(userIds)).map((u) => [u.id, u]));
    const names = await this.persons.namesByUserIds(userIds);
    return rows.flatMap((r) => {
      const user = users.get(r.userId);
      if (!user) return [];
      return [
        {
          assignmentId: r.id,
          nome: names.get(r.userId) ?? null,
          email: user.email,
          papel: r.papel,
          papelNome: r.papelNome,
          status: user.totpEnabledAt ? 'aceito' : 'pendente',
          convidadoEm: r.createdAt.toISOString(),
        } satisfies StaffInviteDto,
      ];
    });
  }

  /** Reenvia o link de acesso de um convite ainda não aceito. */
  async resendStaffInvite(condominioId: string, assignmentId: string): Promise<StaffInviteDto> {
    const invite = (await this.listCondominioStaff(condominioId)).find(
      (i) => i.assignmentId === assignmentId,
    );
    if (!invite) throw new NotFoundException('Convite não encontrado');
    if (invite.status === 'aceito') throw new ConflictException('Esta pessoa já aceitou o convite');
    const user = await this.users.findByEmail(invite.email);
    if (!user) throw new NotFoundException('Convite não encontrado');
    await this.magicLinks.issue(user.id, user.email, 'invite');
    await this.audit.record({
      action: 'role_assignment.invite_resent',
      resourceType: 'role_assignment',
      resourceId: assignmentId,
    });
    return invite;
  }

  /**
   * Papel 'morador' no escopo de uma unidade, criado pelo vínculo pessoa↔unidade.
   * Quem chama já checou a permissão (pessoa:manage no condomínio) e audita o vínculo.
   */
  async assignMoradorToUnit(input: {
    userId: string;
    condominioId: string;
    unitId: string;
    validFrom?: Date | undefined;
    validUntil?: Date | undefined;
  }): Promise<RoleAssignmentDto> {
    const { tx, gestoraId, userId: actorId } = currentContext();
    if (!gestoraId) throw new Error('Vínculo com unidade exige gestora em contexto');
    const [roleRow] = await tx
      .select()
      .from(role)
      .where(and(isNull(role.gestoraId), eq(role.key, 'morador')));
    if (!roleRow) throw new Error('Papel de sistema inexistente: morador');
    return this.insertAssignment({
      gestoraId,
      userId: input.userId,
      role: roleRow,
      scope: { type: 'unit', condominioId: input.condominioId, unitId: input.unitId },
      validFrom: input.validFrom,
      validUntil: input.validUntil,
      grantedBy: actorId,
    });
  }

  /** Revoga uma atribuição (ex.: fim do vínculo com a unidade). Quem chama audita. */
  async revokeAssignment(assignmentId: string): Promise<void> {
    const { tx } = currentContext();
    await tx
      .update(roleAssignment)
      .set({ revokedAt: sql`now()` })
      .where(and(eq(roleAssignment.id, assignmentId), isNull(roleAssignment.revokedAt)));
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
    scope: AssignedScope;
    validFrom?: Date | undefined;
    validUntil?: Date | undefined;
    grantedBy: string | null;
  }): Promise<RoleAssignmentDto> {
    const { tx } = currentContext();
    const scopePath =
      input.scope.type === 'gestora'
        ? gestoraScope(input.gestoraId)
        : input.scope.type === 'condominio'
          ? condominioScope(input.gestoraId, input.scope.condominioId)
          : unitScope(input.gestoraId, input.scope.condominioId, input.scope.unitId);
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
