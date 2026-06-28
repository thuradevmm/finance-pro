import { Icon } from "@/components/ui/icon";

type DateRangeFieldProps = {
  label: string;
  value: string;
};

export function DateRangeField({ label, value }: DateRangeFieldProps) {
  return (
    <label className="relative min-w-0 flex-1 sm:min-w-56 md:flex-none">
      <span className="sr-only">{label}</span>
      <Icon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#76777d]" name="calendar" />
      <input
        aria-label={label}
        className="min-h-11 w-full rounded-md border border-[#c6c6cd] bg-white pl-10 pr-3 text-sm text-[#0b1c30] outline-none transition focus:border-[#2170e4] focus:ring-2 focus:ring-[#2170e4]/20"
        readOnly
        type="text"
        value={value}
      />
    </label>
  );
}
