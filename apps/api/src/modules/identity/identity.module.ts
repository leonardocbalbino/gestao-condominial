import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { SecretBox } from '../../common/crypto';
import { ENV, type Env } from '../../config/env';
import { OrgModule } from '../org/org.module';
import { AuthController } from './auth.controller';
import { AuthService, SECRET_BOX } from './auth.service';
import { AuthorizationService } from './authorization.service';
import { MagicLinkService } from './magic-link.service';
import { MAILER, SmtpMailer } from './mailer';
import { MeController } from './me.controller';
import { PasswordService } from './password.service';
import { RolesController } from './roles.controller';
import { RolesService } from './roles.service';
import { TokenService } from './token.service';
import { UnitAccessController } from './unit-access.controller';
import { UnitAccessService } from './unit-access.service';
import { UsersService } from './users.service';

/**
 * Dono de app_user, refresh_session, magic_link_token, role, role_permission,
 * role_assignment e unit_access_grant.
 */
@Module({
  imports: [
    OrgModule,
    JwtModule.registerAsync({
      inject: [ENV],
      useFactory: (env: Env) => ({
        secret: env.JWT_SECRET,
        signOptions: { algorithm: 'HS256', issuer: 'condo-api' },
        verifyOptions: { algorithms: ['HS256'], issuer: 'condo-api' },
      }),
    }),
  ],
  controllers: [AuthController, MeController, RolesController, UnitAccessController],
  providers: [
    AuthService,
    AuthorizationService,
    MagicLinkService,
    PasswordService,
    RolesService,
    TokenService,
    UnitAccessService,
    UsersService,
    {
      provide: SECRET_BOX,
      inject: [ENV],
      useFactory: (env: Env) => new SecretBox(env.APP_ENCRYPTION_KEY),
    },
    {
      provide: MAILER,
      inject: [ENV],
      useFactory: (env: Env) => new SmtpMailer(env.SMTP_URL, env.MAIL_FROM),
    },
  ],
  exports: [
    SECRET_BOX,
    AuthorizationService,
    MagicLinkService,
    PasswordService,
    RolesService,
    TokenService,
    UnitAccessService,
    UsersService,
  ],
})
export class IdentityModule {}
