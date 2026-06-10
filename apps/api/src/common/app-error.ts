import { HttpException } from '@nestjs/common';
import { ErrorCode } from '@blog/shared';

export class AppError extends HttpException {
  constructor(
    public readonly code: ErrorCode,
    status: number,
    message: string,
    public readonly headers?: Record<string, string>,
  ) {
    super({ code, message }, status);
  }
}
