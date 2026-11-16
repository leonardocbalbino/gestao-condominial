import { Inject, Logger, Module, type OnApplicationBootstrap } from '@nestjs/common';
import { ENV, type Env } from '../../config/env';
import { OrgModule } from '../org/org.module';
import { AttachmentController } from './attachment.controller';
import { AttachmentService } from './attachment.service';
import { OBJECT_STORAGE, S3Storage, type ObjectStorage } from './storage';

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
export class DocumentsModule implements OnApplicationBootstrap {
  private readonly logger = new Logger(DocumentsModule.name);

  constructor(
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStorage,
    @Inject(ENV) private readonly env: Env,
  ) {}

  /** Com S3_ENSURE_BUCKET, garante o bucket versionado (o storage pode subir depois da API). */
  async onApplicationBootstrap(): Promise<void> {
    if (!this.env.S3_ENSURE_BUCKET || !(this.storage instanceof S3Storage)) return;
    for (let attempt = 1; ; attempt++) {
      try {
        await this.storage.ensureBucket();
        return;
      } catch (error) {
        if (attempt >= 30) throw error;
        this.logger.warn(`Storage ainda indisponível (tentativa ${attempt})`);
        await new Promise((resolve) => setTimeout(resolve, 2_000));
      }
    }
  }
}
