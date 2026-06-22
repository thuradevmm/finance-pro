"use client";

import { usePathname } from "next/navigation";
import { createContext, type MouseEvent as ReactMouseEvent, type ReactNode, useCallback, useContext, useEffect, useState } from "react";

import { LoadingOverlay } from "@/components/ui/loading-state";

type InteractionLoadingContextValue = {
  beginLoading: () => void;
  isLoading: boolean;
};

const InteractionLoadingContext = createContext<InteractionLoadingContextValue>({
  beginLoading: () => undefined,
  isLoading: false,
});

export function useInteractionLoading() {
  return useContext(InteractionLoadingContext).beginLoading;
}

export function useIsInteractionLoading() {
  return useContext(InteractionLoadingContext).isLoading;
}

export function InteractionLoadingProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [loadingFromPath, setLoadingFromPath] = useState<string | null>(null);
  const beginLoading = useCallback(() => setLoadingFromPath(pathname), [pathname]);
  const isLoading = loadingFromPath === pathname;

  useEffect(() => {
    if (!isLoading) return;
    const timeout = window.setTimeout(() => setLoadingFromPath(null), 15_000);
    return () => window.clearTimeout(timeout);
  }, [isLoading]);

  function handleClick(event: ReactMouseEvent<HTMLDivElement>) {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    if (!(event.target instanceof Element)) return;
    const anchor = event.target.closest("a");
    if (!anchor || anchor.target === "_blank" || anchor.hasAttribute("download")) return;

    const destination = new URL(anchor.href, window.location.href);
    if (destination.origin !== window.location.origin) return;
    if (destination.pathname === window.location.pathname && destination.search === window.location.search) return;
    beginLoading();
  }

  return (
    <InteractionLoadingContext.Provider value={{ beginLoading, isLoading }}>
      <div className="flex min-h-full flex-1 flex-col" onClickCapture={handleClick}>{children}</div>
      {isLoading ? <LoadingOverlay label="Loading…" /> : null}
    </InteractionLoadingContext.Provider>
  );
}
