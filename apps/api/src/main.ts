import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import type { ValidationError } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/all-exceptions.filter';
import { AppError } from './common/app-error';
import { ErrorCode } from '@blog/shared';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);
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
