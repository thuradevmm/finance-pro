import { Icon } from "@/components/ui/icon";

type SearchFieldProps = {
  label: string;
  placeholder: string;
  className?: string;
  onChange?: (value: string) => void;
  value?: string;
};

export function SearchField({ label, placeholder, className = "", onChange, value }: SearchFieldProps) {
  return (
    <label className={`relative min-w-0 flex-1 sm:min-w-56 ${className}`}>
      <span className="sr-only">{label}</span>
      <Icon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#76777d]" name="search" />
      <input
        aria-label={label}
        className="h-10 w-full rounded-md border border-[#c6c6cd] bg-white pl-10 pr-3 text-sm text-[#0b1c30] outline-none transition placeholder:text-[#6b7280] focus:border-[#2170e4] focus:ring-2 focus:ring-[#2170e4]/20"
        onChange={onChange ? (event) => onChange(event.target.value) : undefined}
        placeholder={placeholder}
        type="search"
        value={value}
      />
    </label>
  );
}
