import { NotificationStreamService } from './notification-stream.service';
import type { NotificationView } from '@blog/shared';

const view: NotificationView = {
  id: 'n1',
  type: 'POST_COMMENT',
  category: 'interaction',
  actor: null,
  post: null,
  commentId: null,
  read: false,
  createdAt: 'x',
};

describe('NotificationStreamService', () => {
  it('delivers pushed views to a connected subscriber', () => {
    const svc = new NotificationStreamService();
    const got: NotificationView[] = [];
    const sub = svc.connect('u1').subscribe((m) => got.push(m.data));
    svc.push('u1', view);
    expect(got).toEqual([view]);
    sub.unsubscribe();
  });

  it('does not deliver to other users', () => {
    const svc = new NotificationStreamService();
    const got: NotificationView[] = [];
    const sub = svc.connect('u1').subscribe((m) => got.push(m.data));
    svc.push('u2', view);
    expect(got).toEqual([]);
    sub.unsubscribe();
  });

  it('push to an unconnected user is a no-op', () => {
    const svc = new NotificationStreamService();
    expect(() => svc.push('nobody', view)).not.toThrow();
  });
});
