import { Icon } from "@/components/ui/icon";

type SearchFieldProps = {
  label: string;
  placeholder: string;
  className?: string;
};

export function SearchField({ label, placeholder, className = "" }: SearchFieldProps) {
  return (
    <label className={`relative min-w-56 flex-1 ${className}`}>
      <span className="sr-only">{label}</span>
      <Icon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#76777d]" name="search" />
      <input
        aria-label={label}
        className="h-10 w-full rounded-md border border-[#c6c6cd] bg-white pl-10 pr-3 text-sm text-[#0b1c30] outline-none transition placeholder:text-[#6b7280] focus:border-[#2170e4] focus:ring-2 focus:ring-[#2170e4]/20"
        placeholder={placeholder}
        type="search"
      />
    </label>
  );
}
