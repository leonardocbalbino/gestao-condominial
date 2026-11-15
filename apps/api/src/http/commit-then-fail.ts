import type { HttpException } from '@nestjs/common';

/**
 * Erro que deve chegar ao cliente, mas cujos efeitos na transação precisam ser gravados.
 * Ex.: reuso de refresh token — revogamos a família inteira e auditamos, depois respondemos 401.
 * Lançar uma HttpException comum desfaria a revogação junto com o rollback.
 */
export class CommitThenFail extends Error {
  constructor(readonly response: HttpException) {
    super(response.message);
  }
}
