"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

import { stageSubmittedQueryDraft, syncSubmittedQueryDraft } from "@/lib/filters/submitted-query";

export function useSubmittedQueryFilter(parameter = "q") {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const appliedValue = searchParams.get(parameter) ?? "";
  const [draftState, setDraftState] = useState(() => stageSubmittedQueryDraft(appliedValue, appliedValue));
  const [isPending, startTransition] = useTransition();
  const restoredRef = useRef(false);
  const storageKey = `finance-pro:filters:${pathname}:${parameter}`;
  const syncedDraftState = syncSubmittedQueryDraft(draftState, appliedValue);

  // React's guarded render-time adjustment keeps the field synchronized with
  // external URL changes (including Back/Forward) without an effect flicker.
  if (syncedDraftState !== draftState) {
    setDraftState(syncedDraftState);
  }

  useEffect(() => {
    if (restoredRef.current) return;
    restoredRef.current = true;
    if (appliedValue) {
      window.localStorage.setItem(storageKey, appliedValue);
      return;
    }
    const storedValue = window.localStorage.getItem(storageKey) ?? "";
    if (storedValue) navigate(storedValue);
    // Navigation is intentionally performed only once for the initial page state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appliedValue, storageKey]);

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
    window.localStorage.setItem(storageKey, normalizedValue);
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
