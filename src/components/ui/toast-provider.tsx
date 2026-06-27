"use client";

import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useState } from "react";

import { Icon } from "@/components/ui/icon";

type ToastTone = "error" | "success";

type ToastMessage = {
  id: string;
  message: string;
  tone: ToastTone;
};

type ToastContextValue = {
  showToast: (message: string, tone?: ToastTone) => void;
  showError: (message: string) => void;
  showSuccess: (message: string) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);
const toastDurationMs = 3600;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [messages, setMessages] = useState<ToastMessage[]>([]);

  const showToast = useCallback((message: string, tone: ToastTone = "success") => {
    const trimmedMessage = message.trim();
    if (!trimmedMessage) return;

    setMessages((currentMessages) => [
      ...currentMessages,
      {
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        message: trimmedMessage,
        tone,
      },
    ]);
  }, []);

  const value = useMemo<ToastContextValue>(() => ({
    showToast,
    showError: (message) => showToast(message, "error"),
    showSuccess: (message) => showToast(message, "success"),
  }), [showToast]);

  function dismissToast(id: string) {
    setMessages((currentMessages) => currentMessages.filter((message) => message.id !== id));
  }

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="fixed right-4 top-4 z-50 flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-3" role="status" aria-live="polite">
        {messages.map((message) => (
          <ToastItem key={message.id} message={message} onDismiss={dismissToast} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastItem({ message, onDismiss }: { message: ToastMessage; onDismiss: (id: string) => void }) {
  useEffect(() => {
    const timer = window.setTimeout(() => onDismiss(message.id), toastDurationMs);
    return () => window.clearTimeout(timer);
  }, [message.id, onDismiss]);

  const isError = message.tone === "error";

  return (
    <div className={`flex items-start gap-3 rounded-lg border bg-white px-4 py-3 text-sm font-semibold shadow-[0_14px_36px_rgba(15,23,42,0.16)] ${isError ? "border-[#fecaca] text-[#991b1b]" : "border-[#bbf7d0] text-[#166534]"}`}>
      <span className={`mt-0.5 grid size-6 shrink-0 place-items-center rounded-full ${isError ? "bg-[#fff1f0]" : "bg-[#ecfdf5]"}`}>
        <Icon className="size-4" name={isError ? "close" : "check"} />
      </span>
      <p className="min-w-0 flex-1 leading-5">{message.message}</p>
      <button
        aria-label="Dismiss message"
        className="grid size-6 shrink-0 place-items-center rounded-md text-[#45464d] transition hover:bg-[#f8f9ff] hover:text-[#0b1c30]"
        onClick={() => onDismiss(message.id)}
        type="button"
      >
        <Icon className="size-4" name="close" />
      </button>
    </div>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error("useToast must be used inside ToastProvider.");
  return context;
}
