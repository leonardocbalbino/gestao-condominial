import { Module } from '@nestjs/common';
import { ENV, type Env } from '../../config/env';
import { OrgModule } from '../org/org.module';
import { AttachmentController } from './attachment.controller';
import { AttachmentService } from './attachment.service';
import { OBJECT_STORAGE, S3Storage } from './storage';

/** Dono da tabela attachment e do storage de arquivos. */
@Module({
  imports: [OrgModule],
  controllers: [AttachmentController],
  providers: [
    AttachmentService,
    { provide: OBJECT_STORAGE, inject: [ENV], useFactory: (env: Env) => new S3Storage(env) },
  ],
  exports: [AttachmentService],
})
export class DocumentsModule {}
