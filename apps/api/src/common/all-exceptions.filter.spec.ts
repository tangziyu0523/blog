import { ArgumentsHost } from '@nestjs/common';
import { AllExceptionsFilter } from './all-exceptions.filter';
import { AppError } from './app-error';
import { ErrorCode } from '@blog/shared';

function mockHost(): { host: ArgumentsHost; json: jest.Mock; status: jest.Mock; setHeader: jest.Mock } {
  const json = jest.fn();
  const setHeader = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  const res = { status, setHeader };
  const req = { headers: {} as Record<string, string> };
  const host = {
    switchToHttp: () => ({ getResponse: () => res, getRequest: () => req }),
  } as unknown as ArgumentsHost;
  return { host, json, status, setHeader };
}

describe('AllExceptionsFilter', () => {
  it('maps AppError to { code, message, traceId } with its status', () => {
    const { host, json, status } = mockHost();
    new AllExceptionsFilter().catch(
      new AppError(ErrorCode.INVALID_CREDENTIALS, 401, 'bad creds'),
      host,
    );
    expect(status).toHaveBeenCalledWith(401);
    const body = json.mock.calls[0][0];
    expect(body.code).toBe(ErrorCode.INVALID_CREDENTIALS);
    expect(body.message).toBe('bad creds');
    expect(typeof body.traceId).toBe('string');
  });

  it('applies AppError headers (Retry-After)', () => {
    const { host, setHeader } = mockHost();
    new AllExceptionsFilter().catch(
      new AppError(ErrorCode.ACCOUNT_LOCKED, 423, 'locked', { 'Retry-After': '900' }),
      host,
    );
    expect(setHeader).toHaveBeenCalledWith('Retry-After', '900');
  });

  it('maps unknown errors to 500 INTERNAL', () => {
    const { host, json, status } = mockHost();
    new AllExceptionsFilter().catch(new Error('boom'), host);
    expect(status).toHaveBeenCalledWith(500);
    expect(json.mock.calls[0][0].code).toBe(ErrorCode.INTERNAL);
  });
});
