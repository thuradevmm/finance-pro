"use client";

import type { ReactNode } from "react";
import { useEffect, useId } from "react";

import { Icon, type IconName } from "@/components/ui/icon";

type ModalShellProps = {
  actions?: ReactNode;
  children: ReactNode;
  icon?: IconName;
  iconClassName?: string;
  isOpen: boolean;
  maxWidthClassName?: string;
  onClose: () => void;
  subtitle?: string;
  title: string;
};

export function ModalShell({
  actions,
  children,
  icon,
  iconClassName,
  isOpen,
  maxWidthClassName = "sm:max-w-2xl",
  onClose,
  subtitle,
  title,
}: ModalShellProps) {
  const titleId = useId();

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen, onClose]);

  if (!isOpen) {
    return null;
  }

  return (
    <div
      aria-labelledby={titleId}
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-end justify-center bg-[#0b1c30]/45 p-0 backdrop-blur-sm sm:items-center sm:p-6"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
      role="dialog"
    >
      <div
        className={`flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-lg border border-[#c6c6cd]/70 bg-white shadow-[0_24px_80px_rgba(15,23,42,0.22)] sm:rounded-lg ${maxWidthClassName}`}
      >
        <header className="flex shrink-0 items-start justify-between gap-4 border-b border-[#c6c6cd]/50 bg-[#f8f9ff] px-5 py-4">
          <div className="flex min-w-0 items-start gap-3">
            {icon ? (
              <span className={`grid size-10 shrink-0 place-items-center rounded-md ${iconClassName ?? "bg-[#eff6ff] text-[#0058be]"}`}>
                <Icon className="size-5" name={icon} />
              </span>
            ) : null}
            <div className="min-w-0">
              <h2 className="truncate text-base font-semibold text-[#0b1c30]" id={titleId}>
                {title}
              </h2>
              {subtitle ? <p className="mt-1 text-sm text-[#45464d]">{subtitle}</p> : null}
            </div>
          </div>
          <button
            aria-label="Close popup"
            className="grid size-9 shrink-0 place-items-center rounded-md text-[#45464d] transition hover:bg-white hover:text-[#0b1c30] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0058be]/25"
            onClick={onClose}
            type="button"
          >
            <Icon className="size-4" name="close" />
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">{children}</div>
        {actions ? <footer className="flex shrink-0 flex-wrap justify-end gap-2 border-t border-[#c6c6cd]/50 px-5 py-4">{actions}</footer> : null}
      </div>
    </div>
  );
}
