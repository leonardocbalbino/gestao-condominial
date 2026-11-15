import { ForbiddenException, Injectable } from '@nestjs/common';
import type { PermissionKey } from '@condo/contracts';
import { sql } from 'drizzle-orm';
import { currentContext } from '../../db/request-context';
import { condominioScope, gestoraScope } from './scope';

/** Recurso alvo: gestora inteira, um condomínio, ou "qualquer escopo" (listagens filtradas). */
export type AuthorizationTarget = { gestoraId: string; condominioId?: string } | 'any';

export type Decision = 'allow' | 'deny' | 'mfa_required';

/**
 * Ponto ÚNICO de decisão de permissão: can(user, permission, resource).
 * Permissão = papel + escopo + validade. O usuário vem do contexto da requisição.
 * Papéis que exigem 2FA só valem se o token atual foi emitido após o segundo fator.
 */
@Injectable()
export class AuthorizationService {
  async decide(permission: PermissionKey, target: AuthorizationTarget): Promise<Decision> {
    const ctx = currentContext();
    if (!ctx.userId || !ctx.gestoraId) return 'deny';
    if (target !== 'any' && target.gestoraId !== ctx.gestoraId) return 'deny';

    const path = target === 'any' ? null : this.pathOf(target);
    const result = await ctx.tx.execute<{ matches: number; allowed: boolean | null }>(sql`
      SELECT count(*)::int AS matches,
             bool_or(NOT ra.requires_mfa OR ${ctx.mfa}) AS allowed
        FROM role_assignment ra
        JOIN role_permission rp ON rp.role_id = ra.role_id
       WHERE ra.user_id = ${ctx.userId}
         AND ra.gestora_id = ${ctx.gestoraId}
         AND rp.permission_key = ${permission}
         AND ra.revoked_at IS NULL
         AND ra.valid_from <= now()
         AND (ra.valid_until IS NULL OR ra.valid_until > now())
         ${path === null ? sql`` : sql`AND ra.scope_path @> ${path}::ltree`}
    `);
    const row = result.rows[0];
    if (!row || row.matches === 0) return 'deny';
    return row.allowed ? 'allow' : 'mfa_required';
  }

  async can(permission: PermissionKey, target: AuthorizationTarget): Promise<boolean> {
    return (await this.decide(permission, target)) === 'allow';
  }

  async assert(permission: PermissionKey, target: AuthorizationTarget): Promise<void> {
    const decision = await this.decide(permission, target);
    if (decision === 'mfa_required') {
      throw new ForbiddenException({
        message: 'Este acesso exige verificação em duas etapas',
        code: 'mfa_required',
      });
    }
    if (decision === 'deny') throw new ForbiddenException();
  }

  /** O usuário possui TODAS as permissões no alvo? (impede escalar privilégio ao delegar). */
  async holdsAll(
    permissions: readonly PermissionKey[],
    target: AuthorizationTarget,
  ): Promise<boolean> {
    for (const permission of permissions) {
      if (!(await this.can(permission, target))) return false;
    }
    return true;
  }

  /** Escopos (ltree) onde o usuário tem a permissão; usado para filtrar listagens. */
  async accessibleScopes(permission: PermissionKey): Promise<string[]> {
    const ctx = currentContext();
    if (!ctx.userId || !ctx.gestoraId) return [];
    const result = await ctx.tx.execute<{ scope_path: string }>(sql`
      SELECT DISTINCT ra.scope_path::text AS scope_path
        FROM role_assignment ra
        JOIN role_permission rp ON rp.role_id = ra.role_id
       WHERE ra.user_id = ${ctx.userId}
         AND ra.gestora_id = ${ctx.gestoraId}
         AND rp.permission_key = ${permission}
         AND ra.revoked_at IS NULL
         AND ra.valid_from <= now()
         AND (ra.valid_until IS NULL OR ra.valid_until > now())
         AND (NOT ra.requires_mfa OR ${ctx.mfa})
    `);
    return result.rows.map((r) => r.scope_path);
  }

  private pathOf(target: { gestoraId: string; condominioId?: string }): string {
    return target.condominioId
      ? condominioScope(target.gestoraId, target.condominioId)
      : gestoraScope(target.gestoraId);
  }
}
