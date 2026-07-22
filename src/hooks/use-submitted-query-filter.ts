"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";

import { stageSubmittedQueryDraft, syncSubmittedQueryDraft } from "@/lib/filters/submitted-query";

export function useSubmittedQueryFilter(parameter = "q") {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const appliedValue = searchParams.get(parameter) ?? "";
  const [draftState, setDraftState] = useState(() => stageSubmittedQueryDraft(appliedValue, appliedValue));
  const [isPending, startTransition] = useTransition();
  const syncedDraftState = syncSubmittedQueryDraft(draftState, appliedValue);

  // React's guarded render-time adjustment keeps the field synchronized with
  // external URL changes (including Back/Forward) without an effect flicker.
  if (syncedDraftState !== draftState) {
    setDraftState(syncedDraftState);
  }

  function setDraftValue(value: string) {
    setDraftState(stageSubmittedQueryDraft(appliedValue, value));
  }

  function navigate(value: string) {
    const normalizedValue = value.trim();
    const params = new URLSearchParams(searchParams.toString());
    if (normalizedValue) params.set(parameter, normalizedValue);
    else params.delete(parameter);
    const query = params.toString();
    const href = query ? `${pathname}?${query}` : pathname;
    setDraftState(stageSubmittedQueryDraft(appliedValue, normalizedValue));
    startTransition(() => router.replace(href, { scroll: false }));
  }

  return {
    appliedValue,
    apply: () => navigate(syncedDraftState.draftValue),
    draftValue: syncedDraftState.draftValue,
    isPending,
    reset: () => navigate(""),
    setDraftValue,
  };
}
