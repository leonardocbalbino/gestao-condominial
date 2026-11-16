import {
  Controller,
  Get,
  Param,
  Post,
  Res,
  StreamableFile,
  UploadedFile as UploadedFileParam,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { AttachmentDto } from '@condo/contracts';
import type { Response } from 'express';
import { RequirePermission } from '../../http/access';
import { AttachmentService, MAX_ATTACHMENT_BYTES, type UploadedFile } from './attachment.service';

const CONDO = { type: 'condominio', param: 'condominioId' } as const;

@Controller('condominios/:condominioId/attachments')
export class AttachmentController {
  constructor(private readonly attachments: AttachmentService) {}

  /** multipart/form-data, campo `file`. */
  @Post()
  @RequirePermission('documento:upload', CONDO)
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: MAX_ATTACHMENT_BYTES, files: 1 } }),
  )
  upload(
    @Param('condominioId') condominioId: string,
    @UploadedFileParam() file: UploadedFile | undefined,
  ): Promise<AttachmentDto> {
    return this.attachments.upload(condominioId, file);
  }

  @Get(':id')
  @RequirePermission('financeiro:read', CONDO)
  get(
    @Param('condominioId') condominioId: string,
    @Param('id') id: string,
  ): Promise<AttachmentDto> {
    return this.attachments.get(condominioId, id);
  }

  @Get(':id/content')
  @RequirePermission('financeiro:read', CONDO)
  async content(
    @Param('condominioId') condominioId: string,
    @Param('id') id: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const { meta, body } = await this.attachments.content(condominioId, id);
    res.setHeader('Content-Type', meta.contentType);
    res.setHeader('X-Content-SHA256', meta.sha256);
    // inline: abre no navegador; nome sanitizado contra injeção de header.
    res.setHeader(
      'Content-Disposition',
      `inline; filename="${meta.nomeArquivo.replace(/[^\w.-]/g, '_')}"`,
    );
    return new StreamableFile(body);
  }
}
