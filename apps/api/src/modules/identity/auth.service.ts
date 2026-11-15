import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import type {
  AuthStepResult,
  LoginRequest,
  MfaEnrollment,
  MfaVerifyRequest,
  SessionTokens,
} from '@condo/contracts';
import { SecretBox } from '../../common/crypto';
import { generateTotpSecret, otpauthUrl, verifyTotp } from '../../common/totp';
import { bindUser } from '../../db/request-context';
import { CommitThenFail } from '../../http/commit-then-fail';
import { AuditService } from '../audit/audit.service';
import { MagicLinkService } from './magic-link.service';
import { PasswordService } from './password.service';
import { ACCESS_TOKEN_TTL_SECONDS, TokenService, type PrimaryFactor } from './token.service';
import { UsersService, type AppUser } from './users.service';

export const SECRET_BOX = Symbol('SECRET_BOX');
const TOTP_ISSUER = 'Gestão Condominial';

/**
 * Fluxo de autenticação:
 *   fator primário (senha OU link mágico)
 *     → se o usuário exige 2FA: mfaToken (verify, ou enroll se ainda não configurou)
 *     → TOTP confirmado → sessão com mfa=true
 *   sem exigência de 2FA (morador) → sessão direto.
 * Eventos de login são auditados na cadeia 'platform' (não pertencem a uma gestora).
 */
@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly users: UsersService,
    private readonly passwords: PasswordService,
    private readonly tokens: TokenService,
    private readonly magicLinks: MagicLinkService,
    private readonly audit: AuditService,
    @Inject(SECRET_BOX) private readonly secrets: SecretBox,
  ) {}

  async login(input: LoginRequest): Promise<AuthStepResult> {
    const user = await this.users.findByEmail(input.email);
    const ok = await this.passwords.verify(user?.passwordHash, input.password);
    if (!user || !ok || user.disabledAt) {
      this.logger.warn({ userId: user?.id }, 'Falha de login por senha');
      throw new UnauthorizedException('E-mail ou senha incorretos');
    }
    return this.afterPrimaryFactor(user, 'pwd');
  }

  /** Sempre responde igual, exista ou não o e-mail (não revela quem tem conta). */
  async requestMagicLink(email: string): Promise<void> {
    const user = await this.users.findByEmail(email);
    if (user && !user.disabledAt) {
      await this.magicLinks.issue(user.id, user.email, 'login');
    }
    await this.audit.record({
      gestoraId: null,
      action: 'auth.magic_link.requested',
      resourceType: 'app_user',
      resourceId: user?.id ?? null,
    });
  }

  async consumeMagicLink(token: string): Promise<AuthStepResult> {
    const userId = await this.magicLinks.consume(token);
    const user = userId ? await this.users.findById(userId) : undefined;
    if (!user || user.disabledAt) throw new UnauthorizedException('Link inválido ou expirado');
    return this.afterPrimaryFactor(user, 'magic');
  }

  async startMfaEnrollment(mfaToken: string): Promise<MfaEnrollment> {
    const claims = this.tokens.verifyMfaToken(mfaToken, ['enroll']);
    const user = claims ? await this.users.findById(claims.sub) : undefined;
    if (!user) throw new UnauthorizedException();
    if (user.totpEnabledAt)
      throw new ConflictException('Verificação em duas etapas já configurada');

    await bindUser(user.id);
    const secret = generateTotpSecret();
    await this.users.setPendingTotp(user.id, this.secrets.encrypt(secret));
    await this.audit.record({
      gestoraId: null,
      action: 'auth.mfa.enrollment_started',
      resourceType: 'app_user',
      resourceId: user.id,
    });
    return { secret, otpauthUrl: otpauthUrl(secret, user.email, TOTP_ISSUER) };
  }

  async verifyMfa(input: MfaVerifyRequest): Promise<AuthStepResult> {
    const claims = this.tokens.verifyMfaToken(input.mfaToken, ['verify', 'enroll']);
    const user = claims ? await this.users.findById(claims.sub) : undefined;
    if (!claims || !user || user.disabledAt) throw new UnauthorizedException();
    if (!user.totpSecretEnc)
      throw new BadRequestException('Configure a verificação em duas etapas primeiro');

    const step = verifyTotp(this.secrets.decrypt(user.totpSecretEnc), input.code, Date.now());
    const enabling = !user.totpEnabledAt;
    // consumeTotpStep só aceita passo maior que o último usado: o mesmo código não vale duas vezes.
    if (step === null || !(await this.users.consumeTotpStep(user.id, step, enabling))) {
      this.logger.warn({ userId: user.id }, 'Código de verificação recusado');
      throw new UnauthorizedException('Código inválido');
    }

    await bindUser(user.id);
    if (enabling) {
      await this.audit.record({
        gestoraId: null,
        action: 'auth.mfa.enabled',
        resourceType: 'app_user',
        resourceId: user.id,
      });
    }
    return this.issueSession(user, true, claims.factor);
  }

  async refresh(refreshToken: string): Promise<SessionTokens> {
    const result = await this.tokens.rotate(refreshToken);
    if (result.status === 'invalid') throw new UnauthorizedException();

    await bindUser(result.userId);
    if (result.status === 'reused') {
      // Token já trocado sendo reapresentado: indício de roubo. Revoga tudo e grava antes de recusar.
      await this.tokens.revokeFamily(result.familyId);
      await this.audit.record({
        gestoraId: null,
        action: 'auth.session.reuse_detected',
        resourceType: 'refresh_session_family',
        resourceId: result.familyId,
      });
      throw new CommitThenFail(new UnauthorizedException());
    }

    const user = await this.users.findById(result.userId);
    if (!user || user.disabledAt) throw new UnauthorizedException();
    await this.audit.record({
      gestoraId: null,
      action: 'auth.session.refreshed',
      resourceType: 'app_user',
      resourceId: user.id,
    });
    return {
      accessToken: this.tokens.issueAccessToken(user.id, result.mfa, user.isPlatformAdmin),
      refreshToken: result.refreshToken,
      expiresIn: ACCESS_TOKEN_TTL_SECONDS,
    };
  }

  async logout(refreshToken: string): Promise<void> {
    const family = await this.tokens.findFamily(refreshToken);
    if (family) {
      await bindUser(family.userId);
      await this.tokens.revokeFamily(family.familyId);
    }
    await this.audit.record({
      gestoraId: null,
      action: 'auth.logout',
      resourceType: 'refresh_session_family',
      resourceId: family?.familyId ?? null,
    });
  }

  private async afterPrimaryFactor(user: AppUser, factor: PrimaryFactor): Promise<AuthStepResult> {
    await bindUser(user.id);
    if (!(await this.users.requiresMfa(user))) {
      return this.issueSession(user, false, factor);
    }
    const stage = user.totpEnabledAt ? 'verify' : 'enroll';
    await this.audit.record({
      gestoraId: null,
      action: 'auth.primary_factor.accepted',
      resourceType: 'app_user',
      resourceId: user.id,
      after: { factor, next: stage },
    });
    const mfaToken = this.tokens.issueMfaToken(user.id, stage, factor);
    return stage === 'verify'
      ? { status: 'mfa_required', mfaToken }
      : { status: 'mfa_enrollment_required', mfaToken };
  }

  private async issueSession(
    user: AppUser,
    mfa: boolean,
    factor: PrimaryFactor,
  ): Promise<AuthStepResult> {
    const session = await this.tokens.createSession(user.id, mfa);
    await this.audit.record({
      gestoraId: null,
      action: 'auth.login',
      resourceType: 'app_user',
      resourceId: user.id,
      after: { factor, mfa },
    });
    return {
      status: 'authenticated',
      accessToken: this.tokens.issueAccessToken(user.id, mfa, user.isPlatformAdmin),
      refreshToken: session.token,
      expiresIn: ACCESS_TOKEN_TTL_SECONDS,
    };
  }
}
