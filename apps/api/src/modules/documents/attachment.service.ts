import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  PayloadTooLargeException,
} from '@nestjs/common';
import type { AttachmentDto } from '@condo/contracts';
import { and, eq } from 'drizzle-orm';
import { sha256Hex } from '../../common/crypto';
import { currentContext } from '../../db/request-context';
import { attachment } from '../../db/schema';
import { AuditService } from '../audit/audit.service';
import { CondominioService } from '../org/condominio.service';
import { OBJECT_STORAGE, type ObjectStorage } from './storage';

export const MAX_ATTACHMENT_BYTES = 15 * 1024 * 1024;

/** Comprovantes: PDF ou imagem. Conferido pelo conteúdo, não só pelo tipo declarado. */
const SIGNATURES: { type: string; magic: number[] }[] = [
  { type: 'application/pdf', magic: [0x25, 0x50, 0x44, 0x46] }, // %PDF
  { type: 'image/png', magic: [0x89, 0x50, 0x4e, 0x47] },
  { type: 'image/jpeg', magic: [0xff, 0xd8, 0xff] },
  { type: 'image/webp', magic: [0x52, 0x49, 0x46, 0x46] }, // RIFF
];

export interface UploadedFile {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

type AttachmentRow = typeof attachment.$inferSelect;

const toDto = (row: AttachmentRow): AttachmentDto => ({
  id: row.id,
  nomeArquivo: row.nomeArquivo,
  contentType: row.contentType,
  tamanho: row.tamanho,
  sha256: row.sha256,
  createdAt: row.createdAt.toISOString(),
});

@Injectable()
export class AttachmentService {
  constructor(
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStorage,
    private readonly condominios: CondominioService,
    private readonly audit: AuditService,
  ) {}

  /** Guarda o arquivo com hash SHA-256 calculado aqui, no recebimento (regra §3.5). */
  async upload(condominioId: string, file: UploadedFile | undefined): Promise<AttachmentDto> {
    if (!file || file.size === 0) throw new BadRequestException('Envie o arquivo no campo "file"');
    if (file.size > MAX_ATTACHMENT_BYTES) {
      throw new PayloadTooLargeException('O arquivo passa do limite de 15 MB');
    }
    const contentType = detectType(file.buffer);
    if (!contentType) throw new BadRequestException('Envie um PDF ou uma imagem (JPG, PNG, WEBP)');
    await this.condominios.assertExists(condominioId);

    const { tx, gestoraId, userId } = currentContext();
    if (!gestoraId) throw new Error('Anexo exige gestora em contexto');
    const sha256 = sha256Hex(file.buffer);
    // Chave pelo conteúdo: o mesmo arquivo reenviado não duplica bytes no storage.
    const storageKey = `${gestoraId}/${condominioId}/${sha256}`;
    await this.storage.put(storageKey, file.buffer, contentType);

    const [row] = await tx
      .insert(attachment)
      .values({
        gestoraId,
        condominioId,
        nomeArquivo: file.originalname.slice(0, 255) || 'arquivo',
        contentType,
        tamanho: file.size,
        sha256,
        storageKey,
        uploadedBy: userId,
      })
      .returning();
    if (!row) throw new Error('Falha ao registrar anexo');
    const dto = toDto(row);
    await this.audit.record({
      action: 'attachment.uploaded',
      resourceType: 'attachment',
      resourceId: dto.id,
      after: dto,
    });
    return dto;
  }

  async get(condominioId: string, id: string): Promise<AttachmentDto> {
    return toDto(await this.row(condominioId, id));
  }

  /** Conteúdo conferido contra o hash gravado: arquivo trocado no storage não passa. */
  async content(condominioId: string, id: string): Promise<{ meta: AttachmentDto; body: Buffer }> {
    const row = await this.row(condominioId, id);
    const body = await this.storage.get(row.storageKey);
    if (sha256Hex(body) !== row.sha256) {
      throw new Error(`Anexo ${id} não confere com o hash gravado`);
    }
    return { meta: toDto(row), body };
  }

  private async row(condominioId: string, id: string): Promise<AttachmentRow> {
    const { tx } = currentContext();
    const [row] = await tx
      .select()
      .from(attachment)
      .where(and(eq(attachment.id, id), eq(attachment.condominioId, condominioId)));
    if (!row) throw new NotFoundException('Anexo não encontrado');
    return row;
  }
}

function detectType(buffer: Buffer): string | null {
  const match = SIGNATURES.find((s) => s.magic.every((byte, i) => buffer[i] === byte));
  if (match?.type === 'image/webp' && buffer.subarray(8, 12).toString('ascii') !== 'WEBP') {
    return null;
  }
  return match?.type ?? null;
}
