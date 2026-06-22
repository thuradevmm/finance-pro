"use client";

import { useRouter } from "next/navigation";
import { type ReactNode, useCallback, useEffect, useRef } from "react";

import {
  clearSessionActivity,
  getLastSessionActivity,
  markSessionActivity,
  SESSION_ACTIVITY_STORAGE_KEY,
  SESSION_IDLE_TIMEOUT_MS,
} from "@/lib/auth/session-timeout";
import { createClient } from "@/lib/supabase/client";

const ACTIVITY_WRITE_INTERVAL_MS = 15_000;

export function SessionTimeoutProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const timerRef = useRef<number | null>(null);
  const lastWriteRef = useRef(0);
  const isAuthenticatedRef = useRef(false);
  const isExpiringRef = useRef(false);

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const expireSession = useCallback(async () => {
    if (isExpiringRef.current) return;
    isExpiringRef.current = true;
    isAuthenticatedRef.current = false;
    clearTimer();
    clearSessionActivity();

    try {
      await createClient().auth.signOut({ scope: "local" });
    } finally {
      router.replace("/login?error=session_expired");
      router.refresh();
    }
  }, [clearTimer, router]);

  const scheduleExpiration = useCallback((lastActivity: number) => {
    clearTimer();
    const remaining = SESSION_IDLE_TIMEOUT_MS - (Date.now() - lastActivity);
    if (remaining <= 0) {
      void expireSession();
      return;
    }
    timerRef.current = window.setTimeout(() => void expireSession(), remaining);
  }, [clearTimer, expireSession]);

  const recordActivity = useCallback(() => {
    if (!isAuthenticatedRef.current || isExpiringRef.current) return;
    const now = Date.now();
    if (now - lastWriteRef.current < ACTIVITY_WRITE_INTERVAL_MS) return;
    lastWriteRef.current = now;
    markSessionActivity(now);
    scheduleExpiration(now);
  }, [scheduleExpiration]);

  useEffect(() => {
    const supabase = createClient();

    function startAuthenticatedSession() {
      isAuthenticatedRef.current = true;
      isExpiringRef.current = false;
      const lastActivity = getLastSessionActivity();
      if (lastActivity === null) {
        const now = Date.now();
        lastWriteRef.current = now;
        markSessionActivity(now);
        scheduleExpiration(now);
        return;
      }
      lastWriteRef.current = lastActivity;
      scheduleExpiration(lastActivity);
    }

    void supabase.auth.getSession().then(({ data }) => {
      if (data.session) startAuthenticatedSession();
    });

    const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT" || !session) {
        isAuthenticatedRef.current = false;
        clearTimer();
        clearSessionActivity();
        return;
      }
      if (!isAuthenticatedRef.current) startAuthenticatedSession();
    });

    const activityEvents: Array<keyof WindowEventMap> = ["pointerdown", "keydown", "touchstart"];
    activityEvents.forEach((eventName) => window.addEventListener(eventName, recordActivity, { passive: true }));

    function handleVisibilityChange() {
      if (document.visibilityState !== "visible" || !isAuthenticatedRef.current) return;
      const lastActivity = getLastSessionActivity();
      if (lastActivity === null || Date.now() - lastActivity >= SESSION_IDLE_TIMEOUT_MS) {
        void expireSession();
      } else {
        scheduleExpiration(lastActivity);
      }
    }

    function handleStorage(event: StorageEvent) {
      if (event.key !== SESSION_ACTIVITY_STORAGE_KEY || !event.newValue || !isAuthenticatedRef.current) return;
      const lastActivity = Number(event.newValue);
      if (Number.isFinite(lastActivity)) scheduleExpiration(lastActivity);
    }

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("storage", handleStorage);

    return () => {
      clearTimer();
      authListener.subscription.unsubscribe();
      activityEvents.forEach((eventName) => window.removeEventListener(eventName, recordActivity));
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("storage", handleStorage);
    };
  }, [clearTimer, expireSession, recordActivity, scheduleExpiration]);

  return children;
}
