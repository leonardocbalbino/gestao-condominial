import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { from, lastValueFrom, type Observable } from 'rxjs';
import { z } from 'zod';
import { APP_DB, PLATFORM_DB } from '../db/database.module';
import { currentContext, runInContext, type Database } from '../db/request-context';
import {
  AuthorizationService,
  type AuthorizationTarget,
} from '../modules/identity/authorization.service';
import { UsersService } from '../modules/identity/users.service';
import { ACCESS_RULE, GESTORA_HEADER, type AccessRule, type PermissionScope } from './access';
import { CommitThenFail } from './commit-then-fail';

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const uuidSchema = z.uuid();

export class UnauditedMutationError extends Error {}

/**
 * Pipeline de toda requisição:
 * 1. abre UMA transação e seta app.gestora_id / app.user_id (RLS);
 * 2. checa a permissão declarada via can() central;
 * 3. executa o handler;
 * 4. rejeita (e desfaz) mutação que não gravou auditoria;
 * 5. COMMIT e hooks afterCommit.
 */
@Injectable()
export class RequestPipelineInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    @Inject(APP_DB) private readonly appDb: Database,
    @Inject(PLATFORM_DB) private readonly platformDb: Database,
    private readonly authz: AuthorizationService,
    private readonly users: UsersService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const rule = this.reflector.getAllAndOverride<AccessRule>(ACCESS_RULE, [
      context.getHandler(),
      context.getClass(),
    ]);
    const request = context.switchToHttp().getRequest<Request>();
    const gestoraId = rule.kind === 'permission' ? this.gestoraFromHeader(request) : null;
    const db = rule.kind === 'platform' ? this.platformDb : this.appDb;

    const run = async () => {
      const outcome = await runInContext(
        db,
        {
          gestoraId,
          userId: request.user?.userId ?? null,
          mfa: request.user?.mfa ?? false,
          ip: request.ip ?? null,
          requestId: typeof request.id === 'string' ? request.id : null,
        },
        async () => {
          await this.authorize(rule, request, gestoraId);
          try {
            const value = await lastValueFrom(next.handle(), { defaultValue: undefined });
            this.assertAudited(request);
            return { ok: true as const, value };
          } catch (error) {
            if (!(error instanceof CommitThenFail)) throw error;
            this.assertAudited(request);
            return { ok: false as const, error: error.response };
          }
        },
      );
      if (!outcome.ok) throw outcome.error;
      return outcome.value;
    };
    return from(run());
  }

  private gestoraFromHeader(request: Request): string {
    const parsed = uuidSchema.safeParse(request.headers[GESTORA_HEADER]);
    if (!parsed.success) {
      throw new BadRequestException(`Header ${GESTORA_HEADER} ausente ou inválido`);
    }
    return parsed.data;
  }

  private async authorize(
    rule: AccessRule,
    request: Request,
    gestoraId: string | null,
  ): Promise<void> {
    if (rule.kind === 'permission' && gestoraId) {
      await this.authz.assert(rule.permission, this.target(rule.scope, request, gestoraId));
      if (rule.scope.type === 'any') {
        currentContext().permissionScopes = await this.authz.accessibleScopes(rule.permission);
      }
    }
    // O claim do token pode estar desatualizado: confirma no banco a cada chamada de plataforma.
    if (
      rule.kind === 'platform' &&
      !(await this.users.isActivePlatformAdmin(request.user?.userId ?? ''))
    ) {
      throw new ForbiddenException();
    }
  }

  private target(scope: PermissionScope, request: Request, gestoraId: string): AuthorizationTarget {
    switch (scope.type) {
      case 'gestora':
        return { gestoraId };
      case 'any':
        return 'any';
      case 'condominio': {
        const id = uuidSchema.safeParse(request.params[scope.param]);
        if (!id.success) throw new BadRequestException('Identificador inválido');
        return { gestoraId, condominioId: id.data };
      }
    }
  }

  private assertAudited(request: Request): void {
    if (MUTATING_METHODS.has(request.method) && currentContext().auditCount === 0) {
      throw new UnauditedMutationError(
        `Mutação sem auditoria: ${request.method} ${request.route?.path ?? request.path}`,
      );
    }
  }
}
