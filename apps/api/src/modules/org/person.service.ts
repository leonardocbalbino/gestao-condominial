import { Injectable } from '@nestjs/common';
import { currentContext } from '../../db/request-context';
import { person } from '../../db/schema';

export interface CreatePersonInput {
  gestoraId: string;
  userId: string | null;
  nome: string;
  email: string | null;
}

@Injectable()
export class PersonService {
  /** Cria a pessoa na gestora; se o usuário já tem cadastro nela, mantém o existente. */
  async ensure(input: CreatePersonInput): Promise<void> {
    const { tx } = currentContext();
    await tx.insert(person).values(input).onConflictDoNothing();
  }
}
