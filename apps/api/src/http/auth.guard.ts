import {
  ForbiddenException,
  Injectable,
  Logger,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { TokenService } from '../modules/identity/token.service';
import { ACCESS_RULE, type AccessRule } from './access';

/**
 * Guard global. Não acessa o banco: só valida o access token (JWT) e aplica a regra
 * declarada na rota. A checagem de permissão (que depende do banco e do tenant)
 * acontece no RequestPipelineInterceptor, dentro da transação da requisição.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  private readonly logger = new Logger(AuthGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly tokens: TokenService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const rule = this.reflector.getAllAndOverride<AccessRule | undefined>(ACCESS_RULE, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!rule) {
      this.logger.error(
        `Rota sem regra de acesso: ${context.getClass().name}.${context.getHandler().name}`,
      );
      throw new ForbiddenException();
    }
    // Webhook: sem usuário; a autenticidade é conferida pelo handler (token da subconta).
    if (rule.kind === 'public' || rule.kind === 'webhook') return true;

    const request = context.switchToHttp().getRequest<Request>();
    const header = request.headers.authorization;
    if (!header?.startsWith('Bearer ')) throw new UnauthorizedException();

    const user = this.tokens.verifyAccessToken(header.slice('Bearer '.length));
    if (!user) throw new UnauthorizedException();
    request.user = user;

    if (rule.kind === 'platform' && !(user.isPlatformAdmin && user.mfa)) {
      throw new ForbiddenException();
    }
    return true;
  }
}
