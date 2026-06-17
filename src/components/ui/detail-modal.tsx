"use client";

import type { ReactNode } from "react";

import { ModalShell } from "@/components/ui/modal-shell";
import type { IconName } from "@/components/ui/icon";

type DetailModalProps = {
  actions?: ReactNode;
  children: ReactNode;
  icon?: IconName;
  iconClassName?: string;
  isOpen: boolean;
  onClose: () => void;
  subtitle?: string;
  title: string;
};

type DetailModalSectionProps = {
  children: ReactNode;
  title?: string;
};

type DetailModalFieldProps = {
  label: string;
  value: ReactNode;
};

export function DetailModal({ actions, children, icon, iconClassName, isOpen, onClose, subtitle, title }: DetailModalProps) {
  return (
    <ModalShell actions={actions} icon={icon} iconClassName={iconClassName} isOpen={isOpen} onClose={onClose} subtitle={subtitle} title={title}>
      {children}
    </ModalShell>
  );
}

export function DetailModalSection({ children, title }: DetailModalSectionProps) {
  return (
    <section className="space-y-3">
      {title ? <h3 className="text-xs font-bold uppercase text-[#76777d]">{title}</h3> : null}
      <div className="grid gap-3 sm:grid-cols-2">{children}</div>
    </section>
  );
}

export function DetailModalField({ label, value }: DetailModalFieldProps) {
  return (
    <div className="rounded-md border border-[#c6c6cd]/60 bg-[#f8f9ff] px-3 py-3">
      <p className="text-xs font-bold uppercase text-[#76777d]">{label}</p>
      <div className="mt-1 text-sm font-semibold text-[#0b1c30]">{value}</div>
    </div>
  );
}
