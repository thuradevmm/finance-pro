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
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
      <div className="space-y-6 lg:col-span-8">
        {children}
        <div className="flex flex-col-reverse items-stretch justify-end gap-3 pt-2 sm:flex-row sm:items-center">
          <Link
            className="inline-flex h-10 items-center justify-center rounded-md px-4 text-sm font-semibold text-[#45464d] transition hover:bg-[#eff4ff]"
            href={cancelHref}
          >
            Cancel
          </Link>
          {secondaryAction}
          <button
            className="inline-flex h-10 items-center justify-center rounded-md bg-[#0b1c30] px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-[#1f2937]"
            onClick={onSave}
            type="button"
          >
            {saveLabel}
          </button>
        </div>
      </div>
      {preview ? <aside className="hidden lg:col-span-4 lg:block">{preview}</aside> : null}
    </div>
  );
}

export function EditFormSection({ children, columns = 2, title }: EditFormSectionProps) {
  return (
    <section className="space-y-4 rounded-lg border border-[#c6c6cd]/60 bg-white p-5 shadow-[0_4px_20px_rgba(15,23,42,0.04)]">
      {title ? <h2 className="text-xl font-semibold text-[#0b1c30]">{title}</h2> : null}
      <div className={columns === 1 ? "grid gap-4" : "grid gap-4 md:grid-cols-2"}>{children}</div>
    </section>
  );
}
