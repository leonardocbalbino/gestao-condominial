import { z } from 'zod';

const emailSchema = z.email().transform((v) => v.toLowerCase());

export const loginRequestSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(256),
});
export type LoginRequest = z.infer<typeof loginRequestSchema>;

export const totpCodeSchema = z.string().regex(/^\d{6}$/, 'Código deve ter 6 dígitos');

export const mfaVerifyRequestSchema = z.object({
  mfaToken: z.string().min(1),
  code: totpCodeSchema,
});
export type MfaVerifyRequest = z.infer<typeof mfaVerifyRequestSchema>;

export const mfaEnrollRequestSchema = z.object({
  mfaToken: z.string().min(1),
});
export type MfaEnrollRequest = z.infer<typeof mfaEnrollRequestSchema>;

export const magicLinkRequestSchema = z.object({
  email: emailSchema,
});
export type MagicLinkRequest = z.infer<typeof magicLinkRequestSchema>;

export const magicLinkConsumeSchema = z.object({
  token: z.string().min(32).max(256),
});
export type MagicLinkConsume = z.infer<typeof magicLinkConsumeSchema>;

export const refreshRequestSchema = z.object({
  refreshToken: z.string().min(32).max(256),
});
export type RefreshRequest = z.infer<typeof refreshRequestSchema>;

export interface SessionTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

/** Resultado de uma etapa de login: sessão emitida ou segundo fator pendente. */
export type AuthStepResult =
  | ({ status: 'authenticated' } & SessionTokens)
  | { status: 'mfa_required'; mfaToken: string }
  | { status: 'mfa_enrollment_required'; mfaToken: string };

export interface MfaEnrollment {
  secret: string;
  otpauthUrl: string;
}
