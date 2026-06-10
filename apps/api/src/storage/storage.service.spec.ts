import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { StorageService } from './storage.service';
import { ErrorCode } from '@blog/shared';

const headMock = jest.fn();
jest.mock('@aws-sdk/client-s3', () => {
  return {
    S3Client: jest.fn().mockImplementation(() => ({ send: (cmd: unknown) => headMock(cmd) })),
    HeadObjectCommand: jest.fn().mockImplementation((input) => ({ input })),
    PutObjectCommand: jest.fn().mockImplementation((input) => ({ input })),
  };
});
jest.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: jest.fn(async () => 'https://minio.local/presigned-put'),
}));

const config = {
  getOrThrow: (k: string) =>
    ({ S3_ENDPOINT: 'http://localhost:9000', S3_ACCESS_KEY: 'x', S3_SECRET_KEY: 'y', S3_BUCKET: 'blog' } as Record<string, string>)[k],
};

describe('StorageService', () => {
  let service: StorageService;
  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [StorageService, { provide: ConfigService, useValue: config }],
    }).compile();
    service = moduleRef.get(StorageService);
  });

  it('presign returns a url and a user-scoped webp key', async () => {
    const { url, key } = await service.presign('u1');
    expect(url).toBe('https://minio.local/presigned-put');
    expect(key).toMatch(/^avatars\/u1\/[0-9a-f-]+\.webp$/);
  });

  it('confirm rejects a key not owned by the user', async () => {
    await expect(service.confirm('u1', 'avatars/u2/abc.webp')).rejects.toMatchObject({ code: ErrorCode.INVALID_UPLOAD });
  });

  it('confirm rejects when object is missing', async () => {
    headMock.mockRejectedValue(new Error('NotFound'));
    await expect(service.confirm('u1', 'avatars/u1/abc.webp')).rejects.toMatchObject({ code: ErrorCode.INVALID_UPLOAD });
  });

  it('confirm rejects when too large', async () => {
    headMock.mockResolvedValue({ ContentLength: 3_000_000, ContentType: 'image/webp' });
    await expect(service.confirm('u1', 'avatars/u1/abc.webp')).rejects.toMatchObject({ code: ErrorCode.INVALID_UPLOAD });
  });

  it('confirm accepts a valid object and returns the key', async () => {
    headMock.mockResolvedValue({ ContentLength: 1_000, ContentType: 'image/webp' });
    await expect(service.confirm('u1', 'avatars/u1/abc.webp')).resolves.toBe('avatars/u1/abc.webp');
  });
});
