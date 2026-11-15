import { Injectable } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { currentContext } from '../../db/request-context';
import { auditLog } from '../../db/schema';

export interface AuditEntry {
  action: string;
  resourceType: string;
  resourceId?: string | null;
  before?: unknown;
  after?: unknown;
  /**
   * Cadeia de destino. Padrão: a gestora em contexto; `null` grava na cadeia 'platform'
   * (eventos sem tenant, como login). O caminho /platform informa a gestora afetada.
   */
  gestoraId?: string | null;
}

export interface ChainVerification {
  ok: boolean;
  checked: number;
  brokenSeq: number | null;
  reason: string | null;
}

/**
 * Trilha de auditoria. A linha é gravada na MESMA transação da mutação: se a mutação
 * for desfeita, a auditoria também é; se a auditoria falhar, a mutação não acontece.
 * Encadeamento (seq, prev_hash, hash) é feito pelo trigger `audit_log_chain` no banco.
 */
@Injectable()
export class AuditService {
  async record(entry: AuditEntry): Promise<void> {
    const ctx = currentContext();
    await ctx.tx.insert(auditLog).values({
      gestoraId: entry.gestoraId === undefined ? ctx.gestoraId : entry.gestoraId,
      actorUserId: ctx.userId,
      action: entry.action,
      resourceType: entry.resourceType,
      resourceId: entry.resourceId ?? null,
      before: entry.before ?? null,
      after: entry.after ?? null,
      ip: ctx.ip,
      requestId: ctx.requestId,
    });
    ctx.auditCount += 1;
  }

  /** Recalcula a cadeia inteira (`chain` = id da gestora ou 'platform'). */
  async verifyChain(chain: string): Promise<ChainVerification> {
    const { tx } = currentContext();
    const result = await tx.execute<{
      ok: boolean;
      checked: string;
      broken_seq: string | null;
      reason: string | null;
    }>(sql`SELECT ok, checked, broken_seq, reason FROM audit_verify_chain(${chain})`);
    const row = result.rows[0];
    if (!row) throw new Error('audit_verify_chain não retornou resultado');
    return {
      ok: row.ok,
      checked: Number(row.checked),
      brokenSeq: row.broken_seq === null ? null : Number(row.broken_seq),
      reason: row.reason,
    };
  }
}
