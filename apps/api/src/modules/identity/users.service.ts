import { Injectable } from '@nestjs/common';
import { and, eq, gt, isNull, or, sql } from 'drizzle-orm';
import { currentContext } from '../../db/request-context';
import { appUser, roleAssignment } from '../../db/schema';

export type AppUser = typeof appUser.$inferSelect;

/** Usuários (login) são globais; dados pessoais por gestora ficam em `person` (módulo org). */
@Injectable()
export class UsersService {
  async findByEmail(email: string): Promise<AppUser | undefined> {
    const { tx } = currentContext();
    const [user] = await tx.select().from(appUser).where(eq(appUser.email, email.toLowerCase()));
    return user;
  }

  async findById(id: string): Promise<AppUser | undefined> {
    const { tx } = currentContext();
    const [user] = await tx.select().from(appUser).where(eq(appUser.id, id));
    return user;
  }

  async findOrCreateByEmail(email: string): Promise<AppUser> {
    const { tx } = currentContext();
    const normalized = email.toLowerCase();
    await tx.insert(appUser).values({ email: normalized }).onConflictDoNothing();
    const [user] = await tx.select().from(appUser).where(eq(appUser.email, normalized));
    if (!user) throw new Error('Falha ao criar usuário');
    return user;
  }

  async setPassword(userId: string, passwordHash: string): Promise<void> {
    const { tx } = currentContext();
    await tx.update(appUser).set({ passwordHash }).where(eq(appUser.id, userId));
  }

  /** Guarda o segredo TOTP (cifrado) ainda não confirmado. */
  async setPendingTotp(userId: string, secretEnc: string): Promise<void> {
    const { tx } = currentContext();
    await tx
      .update(appUser)
      .set({ totpSecretEnc: secretEnc, totpEnabledAt: null, totpLastStep: null })
      .where(eq(appUser.id, userId));
  }

  /**
   * Registra o passo TOTP usado (anti-replay) e ativa o 2FA na primeira confirmação.
   * A condição no WHERE torna a operação atômica contra duas verificações simultâneas.
   */
  async consumeTotpStep(userId: string, step: number, enable: boolean): Promise<boolean> {
    const { tx } = currentContext();
    const updated = await tx
      .update(appUser)
      .set({ totpLastStep: step, ...(enable ? { totpEnabledAt: new Date() } : {}) })
      .where(
        and(
          eq(appUser.id, userId),
          or(isNull(appUser.totpLastStep), sql`${appUser.totpLastStep} < ${step}`),
        ),
      )
      .returning({ id: appUser.id });
    return updated.length === 1;
  }

  /**
   * 2FA obrigatório para super admin e para quem tem qualquer papel ativo que o exija
   * (gestora, síndico, conselho). Depende de app.user_id estar setado (política RLS "self").
   */
  async requiresMfa(user: AppUser): Promise<boolean> {
    if (user.isPlatformAdmin) return true;
    const { tx } = currentContext();
    const [row] = await tx
      .select({ id: roleAssignment.id })
      .from(roleAssignment)
      .where(
        and(
          eq(roleAssignment.userId, user.id),
          eq(roleAssignment.requiresMfa, true),
          isNull(roleAssignment.revokedAt),
          or(isNull(roleAssignment.validUntil), gt(roleAssignment.validUntil, sql`now()`)),
        ),
      )
      .limit(1);
    return Boolean(row);
  }

  async isActivePlatformAdmin(userId: string): Promise<boolean> {
    if (!userId) return false;
    const user = await this.findById(userId);
    return Boolean(user?.isPlatformAdmin && !user.disabledAt);
  }

  async setPlatformAdmin(userId: string): Promise<void> {
    const { tx } = currentContext();
    await tx.update(appUser).set({ isPlatformAdmin: true }).where(eq(appUser.id, userId));
  }
}
