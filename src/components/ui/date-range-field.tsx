import { Icon } from "@/components/ui/icon";

type DateRangeFieldProps = {
  label: string;
  fromValue: string;
  onFromChange: (value: string) => void;
  onToChange: (value: string) => void;
  toValue: string;
};

const dateInputClassName =
  "h-11 w-full rounded-md border border-[#c6c6cd] bg-white pl-10 pr-10 text-sm text-[#0b1c30] outline-none transition focus:border-[#2170e4] focus:ring-2 focus:ring-[#2170e4]/20";

export function DateRangeField({ fromValue, label, onFromChange, onToChange, toValue }: DateRangeFieldProps) {
  return (
    <fieldset className="min-w-0">
      <legend className="sr-only">{label}</legend>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="relative block min-w-0">
          <span className="sr-only">{label} from</span>
          <Icon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#76777d]" name="calendar" />
          <input
            aria-label={`${label} from`}
            className={dateInputClassName}
            onChange={(event) => onFromChange(event.target.value)}
            type="date"
            value={fromValue}
          />
          <Icon className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-[#76777d]" name="chevronDown" />
        </label>
        <label className="relative block min-w-0">
          <span className="sr-only">{label} to</span>
          <Icon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#76777d]" name="calendar" />
          <input
            aria-label={`${label} to`}
            className={dateInputClassName}
            onChange={(event) => onToChange(event.target.value)}
            type="date"
            value={toValue}
          />
          <Icon className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-[#76777d]" name="chevronDown" />
        </label>
      </div>
    </fieldset>
  );
}
