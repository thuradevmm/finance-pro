import { Icon } from "@/components/ui/icon";

type SelectFilterProps = {
  label: string;
  onChange?: (value: string) => void;
  options: string[];
  value?: string;
};

export function SelectFilter({ label, onChange, options, value }: SelectFilterProps) {
  return (
    <label className="relative min-w-0 flex-1 sm:min-w-36 md:flex-none">
      <span className="sr-only">{label}</span>
      <select
        aria-label={label}
        className="min-h-11 w-full appearance-none rounded-md border border-[#c6c6cd] bg-white px-3 pr-11 text-sm text-[#0b1c30] outline-none transition focus:border-[#2170e4] focus:ring-2 focus:ring-[#2170e4]/20"
        onChange={onChange ? (event) => onChange(event.target.value) : undefined}
        value={value}
      >
        {options.map((option) => (
          <option key={option}>{option}</option>
        ))}
      </select>
      <Icon
        className="pointer-events-none absolute right-4 top-1/2 size-4 -translate-y-1/2 text-[#76777d]"
        name="chevronDown"
      />
    </label>
  );
}
