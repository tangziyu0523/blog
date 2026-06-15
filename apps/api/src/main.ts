import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { ValidationPipe } from '@nestjs/common';
import type { ValidationError } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/all-exceptions.filter';
import { AppError } from './common/app-error';
import { ErrorCode } from '@blog/shared';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const config = app.get(ConfigService);
  // Express 'trust proxy': 0 = use the real socket IP (spoof-proof with no proxy);
  // set TRUST_PROXY=<n> for n reverse-proxy hops in production so req.ip is the
  // real client (drives view-count dedup).
  app.set('trust proxy', config.getOrThrow<number>('TRUST_PROXY'));
  app.use(cookieParser());
  app.enableCors({
    origin: config.getOrThrow<string>('WEB_ORIGIN'),
    credentials: true,
  });
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
  await app.listen(config.getOrThrow<number>('PORT'));
}
void bootstrap();
