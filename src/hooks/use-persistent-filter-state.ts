"use client";

import { useEffect, useRef, useState } from "react";

type FilterValue = Record<string, boolean | string>;

function readStoredFilters<T extends FilterValue>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const parsed = JSON.parse(window.localStorage.getItem(`finance-pro:filters:${key}`) ?? "null");
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return fallback;
    return Object.fromEntries(Object.entries(fallback).map(([name, defaultValue]) => [
      name,
      typeof parsed[name] === typeof defaultValue ? parsed[name] : defaultValue,
    ])) as T;
  } catch {
    return fallback;
  }
}

function storeFilters<T extends FilterValue>(key: string, value: T) {
  window.localStorage.setItem(`finance-pro:filters:${key}`, JSON.stringify(value));
}

export function usePersistentFilterState<T extends FilterValue>(
  key: string,
  defaultValue: T,
  restore = true,
) {
  const [draftFilters, setDraftFilters] = useState<T>(defaultValue);
  const [appliedFilters, setAppliedFilters] = useState<T>(defaultValue);
  const defaultValueRef = useRef(defaultValue);

  useEffect(() => {
    if (!restore) {
      storeFilters(key, defaultValueRef.current);
      return;
    }
    const stored = readStoredFilters(key, defaultValueRef.current);
    queueMicrotask(() => {
      setDraftFilters(stored);
      setAppliedFilters(stored);
    });
  }, [key, restore]);

  function applyFilters(value = draftFilters) {
    setDraftFilters(value);
    setAppliedFilters(value);
    storeFilters(key, value);
  }

  function resetFilters() {
    setDraftFilters(defaultValueRef.current);
    setAppliedFilters(defaultValueRef.current);
    storeFilters(key, defaultValueRef.current);
  }

  return { appliedFilters, applyFilters, draftFilters, resetFilters, setDraftFilters };
}
