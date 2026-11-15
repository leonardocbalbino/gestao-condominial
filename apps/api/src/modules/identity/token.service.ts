import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { randomUUID } from 'node:crypto';
import { and, eq, isNull } from 'drizzle-orm';
import { randomToken, sha256Hex } from '../../common/crypto';
import { currentContext } from '../../db/request-context';
import { refreshSession } from '../../db/schema';
import type { AuthenticatedUser } from '../../http/access';

export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;
const MFA_TOKEN_TTL_SECONDS = 5 * 60;
const REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export type MfaStage = 'verify' | 'enroll';
export type PrimaryFactor = 'pwd' | 'magic';

interface AccessClaims {
  typ: 'access';
  sub: string;
  mfa: boolean;
  pa: boolean;
}

interface MfaClaims {
  typ: 'mfa';
  sub: string;
  stage: MfaStage;
  factor: PrimaryFactor;
}

export type RotationResult =
  | { status: 'rotated'; userId: string; mfa: boolean; refreshToken: string }
  | { status: 'reused'; userId: string; familyId: string }
  | { status: 'invalid' };

/**
 * Access token: JWT curto (15 min), sem estado. Refresh token: opaco, guardado como
 * sha256, rotacionado a cada uso; reuso de um token já trocado revoga a família inteira.
 */
@Injectable()
export class TokenService {
  constructor(private readonly jwt: JwtService) {}

  issueAccessToken(userId: string, mfa: boolean, isPlatformAdmin: boolean): string {
    const claims: AccessClaims = { typ: 'access', sub: userId, mfa, pa: isPlatformAdmin };
    return this.jwt.sign(claims, { expiresIn: ACCESS_TOKEN_TTL_SECONDS });
  }

  verifyAccessToken(token: string): AuthenticatedUser | null {
    const claims = this.verify<AccessClaims>(token);
    if (claims?.typ !== 'access') return null;
    return { userId: claims.sub, mfa: claims.mfa, isPlatformAdmin: claims.pa };
  }

  issueMfaToken(userId: string, stage: MfaStage, factor: PrimaryFactor): string {
    const claims: MfaClaims = { typ: 'mfa', sub: userId, stage, factor };
    return this.jwt.sign(claims, { expiresIn: MFA_TOKEN_TTL_SECONDS });
  }

  verifyMfaToken(token: string, allowed: readonly MfaStage[]): MfaClaims | null {
    const claims = this.verify<MfaClaims>(token);
    if (claims?.typ !== 'mfa' || !allowed.includes(claims.stage)) return null;
    return claims;
  }

  async createSession(
    userId: string,
    mfa: boolean,
    familyId: string = randomUUID(),
  ): Promise<{ id: string; token: string }> {
    const { tx } = currentContext();
    const token = randomToken();
    const [row] = await tx
      .insert(refreshSession)
      .values({
        userId,
        familyId,
        mfa,
        tokenHash: sha256Hex(token),
        expiresAt: new Date(Date.now() + REFRESH_TTL_MS),
      })
      .returning({ id: refreshSession.id });
    if (!row) throw new Error('Falha ao criar sessão');
    return { id: row.id, token };
  }

  async rotate(refreshToken: string): Promise<RotationResult> {
    const { tx } = currentContext();
    const [session] = await tx
      .select()
      .from(refreshSession)
      .where(eq(refreshSession.tokenHash, sha256Hex(refreshToken)))
      .for('update');
    if (!session) return { status: 'invalid' };
    if (session.revokedAt)
      return { status: 'reused', userId: session.userId, familyId: session.familyId };
    if (session.expiresAt.getTime() <= Date.now()) return { status: 'invalid' };

    const next = await this.createSession(session.userId, session.mfa, session.familyId);
    await tx
      .update(refreshSession)
      .set({ revokedAt: new Date(), replacedBy: next.id })
      .where(eq(refreshSession.id, session.id));
    return {
      status: 'rotated',
      userId: session.userId,
      mfa: session.mfa,
      refreshToken: next.token,
    };
  }

  async revokeFamily(familyId: string): Promise<void> {
    const { tx } = currentContext();
    await tx
      .update(refreshSession)
      .set({ revokedAt: new Date() })
      .where(and(eq(refreshSession.familyId, familyId), isNull(refreshSession.revokedAt)));
  }

  async findFamily(
    refreshToken: string,
  ): Promise<{ userId: string; familyId: string } | undefined> {
    const { tx } = currentContext();
    const [session] = await tx
      .select({ userId: refreshSession.userId, familyId: refreshSession.familyId })
      .from(refreshSession)
      .where(eq(refreshSession.tokenHash, sha256Hex(refreshToken)));
    return session;
  }

  private verify<T extends object>(token: string): T | null {
    try {
      return this.jwt.verify<T>(token, { algorithms: ['HS256'] });
    } catch {
      return null;
    }
  }
}
