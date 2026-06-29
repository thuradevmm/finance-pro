import type { ReactNode } from "react";

import { Icon } from "@/components/ui/icon";

export function FieldLabel({ children }: { children: string }) {
  return <label className="mb-2 block text-xs font-bold uppercase text-[#45464d]">{children}</label>;
}

export function FormCard({ children, title }: { children: ReactNode; title: string }) {
  return (
    <section className="min-w-0 rounded-lg border border-[#c6c6cd]/60 bg-white p-4 shadow-[0_4px_20px_rgba(15,23,42,0.04)] sm:p-5">
      <h2 className="mb-5 text-lg font-semibold text-[#0b1c30] sm:text-xl">{title}</h2>
      {children}
    </section>
  );
}

export function TextInput({
  error,
  label,
  onChange,
  placeholder,
  value,
  type = "text",
}: {
  error?: boolean;
  label: string;
  onChange?: (value: string) => void;
  placeholder: string;
  value?: string;
  type?: "date" | "number" | "text";
}) {
  const isDate = type === "date";

  return (
    <div className="min-w-0">
      <FieldLabel>{label}</FieldLabel>
      <div className={isDate ? "relative" : undefined}>
        <input
          aria-invalid={error}
          className={`h-12 w-full rounded-lg border bg-white px-4 text-sm font-medium text-[#0b1c30] outline-none transition placeholder:text-[#6b7280] focus:border-[#2170e4] focus:ring-2 focus:ring-[#2170e4]/20 ${
            isDate ? "pr-12" : ""
          } ${error ? "border-[#ba1a1a]" : "border-[#c6c6cd]"}`}
          onChange={(event) => onChange?.(event.target.value)}
          placeholder={placeholder}
          type={type}
          value={value}
        />
        {isDate ? <Icon className="pointer-events-none absolute right-4 top-1/2 size-4 -translate-y-1/2 text-[#76777d]" name="chevronDown" /> : null}
      </div>
    </div>
  );
}

export function SelectInput({
  label,
  onChange,
  options,
  value,
}: {
  label: string;
  onChange?: (value: string) => void;
  options: string[];
  value?: string;
}) {
  return (
    <div className="min-w-0">
      <FieldLabel>{label}</FieldLabel>
      <div className="relative">
        <select
          className="h-12 w-full appearance-none rounded-lg border border-[#c6c6cd] bg-white px-4 pr-12 text-sm font-medium text-[#0b1c30] outline-none transition focus:border-[#2170e4] focus:ring-2 focus:ring-[#2170e4]/20"
          onChange={(event) => onChange?.(event.target.value)}
          value={value}
        >
          {options.map((option) => (
            <option key={option}>{option}</option>
          ))}
        </select>
        <Icon className="pointer-events-none absolute right-4 top-1/2 size-4 -translate-y-1/2 text-[#76777d]" name="chevronDown" />
      </div>
    </div>
  );
}

export function TextAreaInput({
  label,
  onChange,
  placeholder,
  value,
}: {
  label: string;
  onChange?: (value: string) => void;
  placeholder: string;
  value?: string;
}) {
  return (
    <div className="min-w-0">
      <FieldLabel>{label}</FieldLabel>
      <textarea
        className="min-h-28 w-full resize-none rounded-lg border border-[#c6c6cd] bg-white px-4 py-3 text-sm font-medium text-[#0b1c30] outline-none transition placeholder:text-[#6b7280] focus:border-[#2170e4] focus:ring-2 focus:ring-[#2170e4]/20"
        onChange={(event) => onChange?.(event.target.value)}
        placeholder={placeholder}
        rows={4}
        value={value}
      />
    </div>
  );
}
