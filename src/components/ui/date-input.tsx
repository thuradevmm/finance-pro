import { useId } from "react";

import { Icon } from "@/components/ui/icon";

type DateInputSize = "compact" | "default";
type DateInputTone = "default" | "muted";

type DateInputProps = {
  error?: boolean;
  id?: string;
  label: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  readOnly?: boolean;
  showIcon?: boolean;
  size?: DateInputSize;
  tone?: DateInputTone;
  value?: string;
};

const sizeStyles: Record<DateInputSize, { frame: string; icon: string; text: string; textWithoutIcon: string }> = {
  compact: {
    frame: "h-11 rounded-md",
    icon: "right-3",
    text: "left-3 right-11 text-sm",
    textWithoutIcon: "left-3 right-3 text-sm",
  },
  default: {
    frame: "h-12 rounded-lg",
    icon: "right-4",
    text: "left-4 right-12 text-sm font-medium",
    textWithoutIcon: "left-4 right-4 text-sm font-medium",
  },
};

export function formatDateInputDisplay(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return value;

  const [, year, month, day] = match;
  return `${day} / ${month} / ${year}`;
}

export function DateInput({
  error,
  id,
  label,
  onChange,
  placeholder = "",
  readOnly = false,
  showIcon = true,
  size = "default",
  tone = "default",
  value = "",
}: DateInputProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const styles = sizeStyles[size];
  const displayValue = value ? formatDateInputDisplay(value) : placeholder;
  const isPlaceholder = !value && Boolean(placeholder);
  const bgClassName = tone === "muted" ? "bg-[#f8f9ff]" : "bg-white";
  const borderClassName = error ? "border-[#ba1a1a]" : "border-[#c6c6cd]";
  const focusClassName = readOnly ? "" : "focus-within:border-[#2170e4] focus-within:ring-2 focus-within:ring-[#2170e4]/20";
  const textClassName = showIcon ? styles.text : styles.textWithoutIcon;

  return (
    <label className={`relative block min-w-0 overflow-hidden border ${styles.frame} ${borderClassName} ${bgClassName} transition ${focusClassName}`}>
      <span className="sr-only">{label}</span>
      <span
        aria-hidden="true"
        className={`pointer-events-none absolute inset-y-0 ${textClassName} flex min-w-0 items-center text-left ${
          isPlaceholder ? "text-[#6b7280]" : "text-[#0b1c30]"
        }`}
      >
        <span className="truncate">{displayValue}</span>
      </span>
      <input
        aria-invalid={error}
        aria-label={label}
        className={`absolute inset-0 z-10 h-full w-full opacity-0 ${readOnly ? "cursor-default" : "cursor-pointer"}`}
        id={inputId}
        onChange={(event) => onChange?.(event.target.value)}
        readOnly={readOnly}
        type="date"
        value={value}
      />
      {showIcon ? <Icon className={`pointer-events-none absolute ${styles.icon} top-1/2 z-20 size-4 -translate-y-1/2 text-[#76777d]`} name="chevronDown" /> : null}
    </label>
  );
}
