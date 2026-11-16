import { Injectable } from '@nestjs/common';

/** Devolve um motivo para impedir o fechamento do mês, ou null se não houver. */
export type ClosingGuard = (condominioId: string, mes: string) => Promise<string | null>;

/**
 * Outros módulos registram condições para fechar o mês (ex.: a conciliação exige que não
 * haja exceções abertas), sem o razão precisar ler as tabelas deles.
 */
@Injectable()
export class ClosingGuards {
  private readonly guards: ClosingGuard[] = [];

  register(guard: ClosingGuard): void {
    this.guards.push(guard);
  }

  async check(condominioId: string, mes: string): Promise<string[]> {
    const reasons: string[] = [];
    for (const guard of this.guards) {
      const reason = await guard(condominioId, mes);
      if (reason) reasons.push(reason);
    }
    return reasons;
  }
}
