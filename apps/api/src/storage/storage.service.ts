import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  S3Client,
  HeadObjectCommand,
  PutObjectCommand,
  type HeadObjectCommandOutput,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomUUID } from 'node:crypto';
import { ErrorCode } from '@blog/shared';
import { AppError } from '../common/app-error';

const MAX_BYTES = 2 * 1024 * 1024;
const IMAGE_MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED_TYPES = new Set(['image/webp', 'image/jpeg', 'image/png']);

@Injectable()
export class StorageService {
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor(config: ConfigService) {
    this.bucket = config.getOrThrow<string>('S3_BUCKET');
    this.client = new S3Client({
      endpoint: config.getOrThrow<string>('S3_ENDPOINT'),
      region: 'us-east-1',
      forcePathStyle: true,
      credentials: {
        accessKeyId: config.getOrThrow<string>('S3_ACCESS_KEY'),
        secretAccessKey: config.getOrThrow<string>('S3_SECRET_KEY'),
      },
    });
  }

  async presign(userId: string): Promise<{ url: string; key: string }> {
    const key = `avatars/${userId}/${randomUUID()}.webp`;
    const url = await getSignedUrl(
      this.client,
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        ContentType: 'image/webp',
      }),
      { expiresIn: 300 },
    );
    return { url, key };
  }

  async confirm(userId: string, key: string): Promise<string> {
    if (!key.startsWith(`avatars/${userId}/`)) {
      throw new AppError(
        ErrorCode.INVALID_UPLOAD,
        400,
        'Key does not belong to this user',
      );
    }
    let head: HeadObjectCommandOutput;
    try {
      head = await this.client.send(
        new HeadObjectCommand({ Bucket: this.bucket, Key: key }),
      );
    } catch {
      throw new AppError(
        ErrorCode.INVALID_UPLOAD,
        400,
        'Uploaded object not found',
      );
    }
    if ((head.ContentLength ?? 0) > MAX_BYTES) {
      throw new AppError(ErrorCode.INVALID_UPLOAD, 400, 'File too large');
    }
    if (!head.ContentType || !ALLOWED_TYPES.has(head.ContentType)) {
      throw new AppError(
        ErrorCode.INVALID_UPLOAD,
        400,
        'Unsupported content type',
      );
    }
    return key;
  }

  async presignImage(userId: string): Promise<{ url: string; key: string }> {
    const key = `images/${userId}/${randomUUID()}.webp`;
    const url = await getSignedUrl(
      this.client,
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        ContentType: 'image/webp',
      }),
      { expiresIn: 300 },
    );
    return { url, key };
  }

  async confirmImage(userId: string, key: string): Promise<string> {
    if (!key.startsWith(`images/${userId}/`)) {
      throw new AppError(
        ErrorCode.INVALID_UPLOAD,
        400,
        'Key does not belong to this user',
      );
    }
    let head: HeadObjectCommandOutput;
    try {
      head = await this.client.send(
        new HeadObjectCommand({ Bucket: this.bucket, Key: key }),
      );
    } catch {
      throw new AppError(ErrorCode.INVALID_UPLOAD, 400, 'Uploaded object not found');
    }
    if ((head.ContentLength ?? 0) > IMAGE_MAX_BYTES) {
      throw new AppError(ErrorCode.INVALID_UPLOAD, 400, 'File too large');
    }
    // Images are webp-only by design: the client transcodes to webp before PUT.
    if (head.ContentType !== 'image/webp') {
      throw new AppError(ErrorCode.INVALID_UPLOAD, 400, 'Unsupported content type');
    }
    return key;
  }
}
