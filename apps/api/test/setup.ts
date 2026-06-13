import { Test } from '@nestjs/testing';
import { ValidationPipe } from '@nestjs/common';
import type { ValidationError, INestApplication } from '@nestjs/common';
import { ThrottlerStorage } from '@nestjs/throttler';
import cookieParser from 'cookie-parser';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/all-exceptions.filter';
import { AppError } from '../src/common/app-error';
import { ErrorCode } from '@blog/shared';
import { PrismaService } from '../src/prisma/prisma.service';
import { RedisService } from '../src/redis/redis.service';

interface TestAppOptions {
  // Rate limiting is per-IP and in-memory, so all supertest requests (same
  // 127.0.0.1) share one window across a whole e2e file. Disable it for
  // functional suites so accumulated requests don't trip the limiter; leave it
  // on (default) for suites that specifically assert throttling.
  disableThrottle?: boolean;
}

export async function createTestApp(
  options: TestAppOptions = {},
): Promise<INestApplication> {
  const builder = Test.createTestingModule({
    imports: [AppModule],
  });
  if (options.disableThrottle) {
    // ThrottlerGuard is registered via APP_GUARD, so overrideGuard() can't reach
    // it. Instead starve the limiter by overriding its storage to report zero
    // hits — the guard stays live but never blocks.
    builder.overrideProvider(ThrottlerStorage).useValue({
      increment: async () => ({
        totalHits: 0,
        timeToExpire: 0,
        isBlocked: false,
        timeToBlockExpire: 0,
      }),
    });
  }
  const moduleRef = await builder.compile();
  const app = moduleRef.createNestApplication();
  app.use(cookieParser());
  app.useGlobalFilters(new AllExceptionsFilter());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      exceptionFactory: (errors: ValidationError[]) =>
        new AppError(
          ErrorCode.VALIDATION_ERROR,
          400,
          errors
            .map((e) => Object.values(e.constraints ?? {}).join(', '))
            .join('; '),
        ),
    }),
  );
  await app.init();
  return app;
}

export async function resetDb(app: INestApplication): Promise<void> {
  const prisma = app.get(PrismaService);
  await prisma.notification.deleteMany();
  await prisma.follow.deleteMany();
  await prisma.commentLike.deleteMany();
  await prisma.comment.deleteMany();
  await prisma.like.deleteMany();
  await prisma.post.deleteMany();
  await prisma.user.deleteMany();
  const redis = app.get(RedisService);
  await redis.flushdb();
}
