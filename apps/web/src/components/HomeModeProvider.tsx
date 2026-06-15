"use client";

import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useState,
  type ReactNode,
} from "react";
import { usePathname } from "next/navigation";
import { consumeNavType } from "@/lib/nav-history";
import {
  HOME_INTRO_EVENT,
  LIST_OFFSET_KEY,
  SCROLL_TO_INDEX_EVENT,
  consumeToIndexIntent,
} from "@/lib/home-landing";
import { parseSavedScroll } from "@/lib/scroll-restoration";
import { decideHomeMode, HOME_MODES_ENABLED, type HomeMode } from "@/lib/home-mode";

interface HomeModeState {
  mode: HomeMode;
  /** Native scroll offset to restore in list mode (px); null = top. */
  listOffset: number | null;
}

const INTRO: HomeModeState = { mode: "intro", listOffset: null };

const HomeModeContext = createContext<HomeModeState>(INTRO);

const useIsoLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

/**
 * Provides the home render mode, decided once per home mount from the nav signals.
 * When HOME_MODES_ENABLED is false it always reports intro mode (today's behavior).
 */
export function HomeModeProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [state, setState] = useState<HomeModeState>(INTRO);

  // Decide before paint so the intro never flashes when landing on the list.
  useIsoLayoutEffect(() => {
    if (!HOME_MODES_ENABLED || pathname !== "/") {
      setState(INTRO);
      return;
    }
    const intent = consumeToIndexIntent();
    const mode = decideHomeMode(consumeNavType(), intent);
    const listOffset = intent ? 0 : parseSavedScroll(sessionStorage.getItem(LIST_OFFSET_KEY));
    setState({ mode, listOffset });
  }, [pathname]);

  // "文章列表" clicked while already on home → switch to list mode at the top.
  // Logo clicked while already on home → switch to intro mode.
  useEffect(() => {
    if (!HOME_MODES_ENABLED) return;
    const onToIndex = (): void => setState({ mode: "list", listOffset: 0 });
    const onToIntro = (): void => setState(INTRO);
    window.addEventListener(SCROLL_TO_INDEX_EVENT, onToIndex);
    window.addEventListener(HOME_INTRO_EVENT, onToIntro);
    return () => {
      window.removeEventListener(SCROLL_TO_INDEX_EVENT, onToIndex);
      window.removeEventListener(HOME_INTRO_EVENT, onToIntro);
    };
  }, []);

  return <HomeModeContext.Provider value={state}>{children}</HomeModeContext.Provider>;
}

export function useHomeMode(): HomeModeState {
  return useContext(HomeModeContext);
}
