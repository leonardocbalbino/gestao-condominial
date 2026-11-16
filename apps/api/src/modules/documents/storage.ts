import {
  CreateBucketCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutBucketVersioningCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import type { Env } from '../../config/env';

/** Porta de armazenamento de arquivos. Produção/dev: S3 (MinIO); testes: em memória. */
export interface ObjectStorage {
  put(key: string, body: Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<Buffer>;
}

export const OBJECT_STORAGE = Symbol('OBJECT_STORAGE');

/** Bucket com versionamento ligado (infra): sobrescrever uma chave nunca perde a versão anterior. */
export class S3Storage implements ObjectStorage {
  private readonly client: S3Client;

  constructor(private readonly env: Env) {
    this.client = new S3Client({
      endpoint: env.S3_ENDPOINT,
      region: env.S3_REGION,
      forcePathStyle: env.S3_FORCE_PATH_STYLE,
      credentials: {
        accessKeyId: env.S3_ACCESS_KEY_ID,
        secretAccessKey: env.S3_SECRET_ACCESS_KEY,
      },
    });
  }

  async put(key: string, body: Buffer, contentType: string): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.env.S3_BUCKET,
        Key: key,
        Body: body,
        ContentType: contentType,
      }),
    );
  }

  /**
   * Cria o bucket (se não existir) com versionamento ligado. Usado em dev e homologação
   * (S3_ENSURE_BUCKET=true); em produção o bucket é provisionado fora da aplicação.
   */
  async ensureBucket(): Promise<void> {
    const Bucket = this.env.S3_BUCKET;
    const exists = await this.client.send(new HeadBucketCommand({ Bucket })).then(
      () => true,
      () => false,
    );
    if (!exists) await this.client.send(new CreateBucketCommand({ Bucket }));
    await this.client.send(
      new PutBucketVersioningCommand({ Bucket, VersioningConfiguration: { Status: 'Enabled' } }),
    );
  }

  async get(key: string): Promise<Buffer> {
    const result = await this.client.send(
      new GetObjectCommand({ Bucket: this.env.S3_BUCKET, Key: key }),
    );
    if (!result.Body) throw new Error(`Objeto vazio: ${key}`);
    return Buffer.from(await result.Body.transformToByteArray());
  }
}
