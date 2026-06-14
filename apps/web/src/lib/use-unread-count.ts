"use client";

import { startTransition, useEffect, useState } from "react";
import { useAuth } from "./auth-context";
import { fetchUnreadCount } from "./notifications";

/** 登录时返回未读通知数（挂载时 + 窗口聚焦时刷新）。未登录返回 0。 */
export function useUnreadCount(): number {
  const { user } = useAuth();
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!user) {
      startTransition(() => setCount(0));
      return;
    }
    let active = true;
    const load = () => {
      fetchUnreadCount()
        .then((r) => active && startTransition(() => setCount(r.count)))
        .catch(() => undefined);
    };
    load();
    window.addEventListener("focus", load);
    return () => {
      active = false;
      window.removeEventListener("focus", load);
    };
  }, [user]);

  return count;
}
