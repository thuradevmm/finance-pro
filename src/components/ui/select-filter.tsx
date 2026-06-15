import { Icon } from "@/components/ui/icon";

type SelectFilterProps = {
  label: string;
  options: string[];
};

export function SelectFilter({ label, options }: SelectFilterProps) {
  return (
    <label className="relative min-w-36 flex-1 md:flex-none">
      <span className="sr-only">{label}</span>
      <select
        aria-label={label}
        className="h-10 w-full appearance-none rounded-md border border-[#c6c6cd] bg-white px-3 pr-9 text-sm text-[#0b1c30] outline-none transition focus:border-[#2170e4] focus:ring-2 focus:ring-[#2170e4]/20"
        defaultValue={options[0]}
      >
        {options.map((option) => (
          <option key={option}>{option}</option>
        ))}
      </select>
      <Icon
        className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-[#76777d]"
        name="chevronDown"
      />
    </label>
  );
}
