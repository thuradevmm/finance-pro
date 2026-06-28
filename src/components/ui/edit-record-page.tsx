"use client";

import Link from "next/link";
import type { ReactNode } from "react";

type EditRecordPageProps = {
  cancelHref: string;
  children: ReactNode;
  onSave: () => void;
  preview?: ReactNode;
  saveLabel?: string;
  secondaryAction?: ReactNode;
};

type EditFormSectionProps = {
  children: ReactNode;
  columns?: 1 | 2;
  title?: string;
};

export function EditRecordPage({ cancelHref, children, onSave, preview, saveLabel = "Save Changes", secondaryAction }: EditRecordPageProps) {
  return (
    <div className="grid min-w-0 grid-cols-1 gap-6 xl:grid-cols-12">
      <div className="min-w-0 space-y-6 xl:col-span-8">
        {children}
        <div className="flex flex-col-reverse items-stretch justify-end gap-3 pt-2 sm:flex-row sm:items-center">
          <Link
            className="inline-flex min-h-11 items-center justify-center rounded-md px-4 text-sm font-semibold text-[#45464d] transition hover:bg-[#eff4ff]"
            href={cancelHref}
          >
            Cancel
          </Link>
          {secondaryAction}
          <button
            className="inline-flex min-h-11 items-center justify-center rounded-md bg-[#0b1c30] px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-[#1f2937]"
            onClick={onSave}
            type="button"
          >
            {saveLabel}
          </button>
        </div>
      </div>
      {preview ? <aside className="hidden min-w-0 xl:col-span-4 xl:block">{preview}</aside> : null}
    </div>
  );
}

export function EditFormSection({ children, columns = 2, title }: EditFormSectionProps) {
  return (
    <section className="min-w-0 space-y-4 rounded-lg border border-[#c6c6cd]/60 bg-white p-4 shadow-[0_4px_20px_rgba(15,23,42,0.04)] sm:p-5">
      {title ? <h2 className="break-words text-lg font-semibold text-[#0b1c30] sm:text-xl">{title}</h2> : null}
      <div className={columns === 1 ? "grid gap-4" : "grid gap-4 md:grid-cols-2"}>{children}</div>
    </section>
  );
}
