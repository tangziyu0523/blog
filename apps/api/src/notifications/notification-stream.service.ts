import { Injectable } from '@nestjs/common';
import { Observable, Subject } from 'rxjs';
import { finalize } from 'rxjs/operators';
import type { NotificationView } from '@blog/shared';

export interface SseMessage {
  data: NotificationView;
}

/** In-process per-user SSE fan-out. Single-instance; Redis pub/sub is the multi-instance seam. */
@Injectable()
export class NotificationStreamService {
  private readonly channels = new Map<string, Set<Subject<SseMessage>>>();

  connect(userId: string): Observable<SseMessage> {
    const subject = new Subject<SseMessage>();
    const set = this.channels.get(userId) ?? new Set<Subject<SseMessage>>();
    set.add(subject);
    this.channels.set(userId, set);
    return subject.asObservable().pipe(
      finalize(() => {
        set.delete(subject);
        if (set.size === 0) this.channels.delete(userId);
      }),
    );
  }

  push(userId: string, view: NotificationView): void {
    const set = this.channels.get(userId);
    if (!set) return;
    for (const subject of set) subject.next({ data: view });
  }
}
