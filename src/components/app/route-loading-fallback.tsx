"use client";

import { useIsInteractionLoading } from "@/components/app/interaction-loading-provider";
import { LoadingOverlay } from "@/components/ui/loading-state";

export function RouteLoadingFallback() {
  const isInteractionLoading = useIsInteractionLoading();

  return isInteractionLoading ? null : <LoadingOverlay label="Loading…" />;
}
