import { Injectable, type OnModuleInit } from '@nestjs/common';
import { hash, verify } from '@node-rs/argon2';

/** Argon2id com os parâmetros recomendados pela OWASP (19 MiB, 2 iterações). */
const OPTIONS = { memoryCost: 19_456, timeCost: 2, parallelism: 1 } as const;

@Injectable()
export class PasswordService implements OnModuleInit {
  /** Hash descartável: usado quando o e-mail não existe, para o tempo de resposta não revelar isso. */
  private dummyHash = '';

  async onModuleInit(): Promise<void> {
    this.dummyHash = await hash('senha-inexistente', OPTIONS);
  }

  hash(password: string): Promise<string> {
    return hash(password, OPTIONS);
  }

  async verify(storedHash: string | null | undefined, password: string): Promise<boolean> {
    const ok = await verify(storedHash ?? this.dummyHash, password).catch(() => false);
    return ok && Boolean(storedHash);
  }
}
