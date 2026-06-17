import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { ErrorCode } from '@blog/shared';
import { AppError } from './app-error';
import type { Request, Response } from 'express';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();
    const traceId =
      (req.headers['x-trace-id'] as string | undefined) ?? randomUUID();

    if (exception instanceof AppError) {
      if (exception.headers) {
        for (const [k, v] of Object.entries(exception.headers))
          res.setHeader(k, v);
      }
      res
        .status(exception.getStatus())
        .json({ code: exception.code, message: exception.message, traceId });
      return;
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const resp = exception.getResponse();
      const message =
        typeof resp === 'string'
          ? resp
          : ((resp as { message?: unknown }).message ?? exception.message);
      const code =
        status === Number(HttpStatus.TOO_MANY_REQUESTS)
          ? ErrorCode.RATE_LIMITED
          : ErrorCode.INTERNAL;
      const text = Array.isArray(message)
        ? message.join('; ')
        : typeof message === 'string'
          ? message
          : JSON.stringify(message);
      res.status(status).json({ code, message: text, traceId });
      return;
    }

    console.error('[AllExceptionsFilter]', exception);
    res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      code: ErrorCode.INTERNAL,
      message: 'Internal server error',
      traceId,
    });
  }
}
