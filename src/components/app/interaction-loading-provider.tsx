"use client";

import { usePathname } from "next/navigation";
import { createContext, type ReactNode, useCallback, useContext, useEffect, useState } from "react";

import { NavigationProgress } from "@/components/ui/loading-state";

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

  return (
    <InteractionLoadingContext.Provider value={{ beginLoading, isLoading }}>
      <div className="flex min-h-full flex-1 flex-col">{children}</div>
      {isLoading ? <NavigationProgress /> : null}
    </InteractionLoadingContext.Provider>
  );
}
