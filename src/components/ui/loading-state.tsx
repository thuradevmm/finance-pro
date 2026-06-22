import type { ButtonHTMLAttributes, ReactNode } from "react";

export function LoadingSpinner({ className = "size-4" }: { className?: string }) {
  return <span aria-hidden="true" className={`${className} animate-spin rounded-full border-2 border-current border-r-transparent`} />;
}

export function LoadingButton({
  children,
  isLoading,
  loadingLabel = "Working…",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
  isLoading: boolean;
  loadingLabel?: string;
}) {
  return (
    <button {...props} disabled={props.disabled || isLoading}>
      {isLoading ? <><LoadingSpinner /><span>{loadingLabel}</span></> : children}
    </button>
  );
}

export function LoadingOverlay({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="fixed inset-0 z-[100] grid place-items-center bg-[#0b1c30]/25 p-4 backdrop-blur-[2px]" role="status">
      <div className="flex items-center gap-3 rounded-lg border border-white/60 bg-white px-5 py-4 text-sm font-semibold text-[#0b1c30] shadow-[0_20px_60px_rgba(15,23,42,0.25)]">
        <LoadingSpinner className="size-5 text-[#0058be]" />
        <span>{label}</span>
      </div>
    </div>
  );
}
