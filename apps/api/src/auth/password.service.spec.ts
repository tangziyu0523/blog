import { PasswordService } from './password.service';

describe('PasswordService', () => {
  const svc = new PasswordService();

  it('hashes and verifies a correct password', async () => {
    const hash = await svc.hash('s3cret-pass');
    expect(hash).not.toContain('s3cret-pass');
    expect(await svc.verify(hash, 's3cret-pass')).toBe(true);
  });

  it('rejects a wrong password', async () => {
    const hash = await svc.hash('s3cret-pass');
    expect(await svc.verify(hash, 'wrong')).toBe(false);
  });
});
