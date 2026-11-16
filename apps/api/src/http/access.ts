import { SetMetadata } from '@nestjs/common';
import type { PermissionKey } from '@condo/contracts';

/**
 * Toda rota declara sua regra de acesso. Rota sem regra é negada pelo AuthGuard
 * (nega por padrão), então esquecer o decorator nunca abre um endpoint.
 */
export type PermissionScope =
  /** O recurso é a gestora em contexto (ex.: criar condomínio). */
  | { type: 'gestora' }
  /** O recurso é o condomínio cujo id está no parâmetro de rota `param`. */
  | { type: 'condominio'; param: string }
  /**
   * O recurso é a unidade `unitParam` do condomínio `condominioParam`. O serviço precisa
   * filtrar pelos dois ids (a unidade tem de pertencer ao condomínio da rota).
   */
  | { type: 'unit'; condominioParam: string; unitParam: string }
  /** Basta ter a permissão em algum escopo; o serviço filtra pelo que é acessível. */
  | { type: 'any' };

export type AccessRule =
  | { kind: 'public' }
  | { kind: 'authenticated' }
  | { kind: 'permission'; permission: PermissionKey; scope: PermissionScope }
  | { kind: 'platform' };

export const ACCESS_RULE = 'access_rule';

export const Public = () => SetMetadata(ACCESS_RULE, { kind: 'public' } satisfies AccessRule);

/** Qualquer usuário autenticado, sem gestora em contexto (ex.: /me). */
export const Authenticated = () =>
  SetMetadata(ACCESS_RULE, { kind: 'authenticated' } satisfies AccessRule);

/** Exige o header `x-gestora-id` e a permissão no escopo indicado, via `can()`. */
export const RequirePermission = (
  permission: PermissionKey,
  scope: PermissionScope = { type: 'gestora' },
) => SetMetadata(ACCESS_RULE, { kind: 'permission', permission, scope } satisfies AccessRule);

/** Caminho do super admin: conexão app_platform, exige is_platform_admin + 2FA. */
export const PlatformAdmin = () =>
  SetMetadata(ACCESS_RULE, { kind: 'platform' } satisfies AccessRule);

export const GESTORA_HEADER = 'x-gestora-id';

export interface AuthenticatedUser {
  userId: string;
  mfa: boolean;
  isPlatformAdmin: boolean;
}
