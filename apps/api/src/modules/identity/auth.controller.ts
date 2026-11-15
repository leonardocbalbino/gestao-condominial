import { Body, Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import {
  loginRequestSchema,
  magicLinkConsumeSchema,
  magicLinkRequestSchema,
  mfaEnrollRequestSchema,
  mfaVerifyRequestSchema,
  refreshRequestSchema,
  type AuthStepResult,
  type LoginRequest,
  type MagicLinkConsume,
  type MagicLinkRequest,
  type MfaEnrollment,
  type MfaEnrollRequest,
  type MfaVerifyRequest,
  type RefreshRequest,
  type SessionTokens,
} from '@condo/contracts';
import { Public } from '../../http/access';
import { ZodPipe } from '../../http/zod.pipe';
import { AuthService } from './auth.service';

@Controller('auth')
@Public()
@UseGuards(ThrottlerGuard)
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  login(@Body(new ZodPipe(loginRequestSchema)) body: LoginRequest): Promise<AuthStepResult> {
    return this.auth.login(body);
  }

  @Post('magic-link')
  @HttpCode(HttpStatus.ACCEPTED)
  async requestMagicLink(
    @Body(new ZodPipe(magicLinkRequestSchema)) body: MagicLinkRequest,
  ): Promise<void> {
    await this.auth.requestMagicLink(body.email);
  }

  @Post('magic-link/consume')
  @HttpCode(HttpStatus.OK)
  consumeMagicLink(
    @Body(new ZodPipe(magicLinkConsumeSchema)) body: MagicLinkConsume,
  ): Promise<AuthStepResult> {
    return this.auth.consumeMagicLink(body.token);
  }

  @Post('mfa/enroll')
  @HttpCode(HttpStatus.OK)
  enroll(
    @Body(new ZodPipe(mfaEnrollRequestSchema)) body: MfaEnrollRequest,
  ): Promise<MfaEnrollment> {
    return this.auth.startMfaEnrollment(body.mfaToken);
  }

  @Post('mfa/verify')
  @HttpCode(HttpStatus.OK)
  verify(
    @Body(new ZodPipe(mfaVerifyRequestSchema)) body: MfaVerifyRequest,
  ): Promise<AuthStepResult> {
    return this.auth.verifyMfa(body);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  refresh(@Body(new ZodPipe(refreshRequestSchema)) body: RefreshRequest): Promise<SessionTokens> {
    return this.auth.refresh(body.refreshToken);
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(@Body(new ZodPipe(refreshRequestSchema)) body: RefreshRequest): Promise<void> {
    await this.auth.logout(body.refreshToken);
  }
}
