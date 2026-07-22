import type { ComponentPropsWithoutRef, ReactNode } from "react";

import { Icon } from "@/components/ui/icon";

type FilterFormProps = ComponentPropsWithoutRef<"form"> & {
  children: ReactNode;
};

export function FilterForm({ children, className = "", ...props }: FilterFormProps) {
  return (
    <form className={className} {...props}>
      {children}
    </form>
  );
}

type FilterActionsProps = {
  isPending?: boolean;
  onReset: () => void;
  resetLabel?: string;
  searchLabel?: string;
};

export function FilterActions({
  isPending = false,
  onReset,
  resetLabel = "Reset",
  searchLabel = "Search",
}: FilterActionsProps) {
  return (
    <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
      <button
        className="inline-flex min-h-11 w-full items-center justify-center rounded-md border border-[#c6c6cd] bg-white px-4 text-sm font-semibold text-[#45464d] transition hover:bg-[#eff4ff] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2170e4]/25 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
        disabled={isPending}
        onClick={onReset}
        type="button"
      >
        {resetLabel}
      </button>
      <button
        className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-md bg-[#0b1c30] px-5 text-sm font-semibold text-white transition hover:bg-[#18314f] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2170e4]/30 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
        disabled={isPending}
        type="submit"
      >
        <Icon className="size-4" name="search" />
        {isPending ? "Searching…" : searchLabel}
      </button>
    </div>
  );
}
