import { viewerKeyFor } from './viewer-key';

describe('viewerKeyFor', () => {
  it('uses the userId when authenticated', () => {
    expect(viewerKeyFor('user-123', '1.2.3.4', 'UA')).toBe('u:user-123');
  });

  it('hashes ip+ua for anonymous viewers', () => {
    const k = viewerKeyFor(undefined, '1.2.3.4', 'Mozilla/5.0');
    expect(k.startsWith('a:')).toBe(true);
    expect(k).not.toContain('1.2.3.4');
  });

  it('is stable for the same anonymous input', () => {
    const a = viewerKeyFor(undefined, '1.2.3.4', 'UA');
    const b = viewerKeyFor(undefined, '1.2.3.4', 'UA');
    expect(a).toBe(b);
  });

  it('differs when ip or ua differ', () => {
    const a = viewerKeyFor(undefined, '1.2.3.4', 'UA');
    const b = viewerKeyFor(undefined, '9.9.9.9', 'UA');
    const c = viewerKeyFor(undefined, '1.2.3.4', 'OTHER');
    expect(a).not.toBe(b);
    expect(a).not.toBe(c);
  });

  it('treats missing ip/ua as empty but stays anonymous', () => {
    const k = viewerKeyFor(undefined, undefined, undefined);
    expect(k.startsWith('a:')).toBe(true);
  });
});
