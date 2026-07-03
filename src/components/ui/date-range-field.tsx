import { Icon } from "@/components/ui/icon";

type DateRangeFieldProps = {
  label: string;
  fromValue: string;
  onFromChange: (value: string) => void;
  onToChange: (value: string) => void;
  toValue: string;
};

function formatDateValue(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return value;

  const [, year, month, day] = match;
  return `${day} / ${month} / ${year}`;
}

function DateRangeInput({ label, onChange, value }: { label: string; onChange: (value: string) => void; value: string }) {
  return (
    <label className="relative block h-11 min-w-0 overflow-hidden rounded-md border border-[#c6c6cd] bg-white transition focus-within:border-[#2170e4] focus-within:ring-2 focus-within:ring-[#2170e4]/20">
      <span className="sr-only">{label}</span>
      <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-3 right-11 flex min-w-0 items-center text-left text-sm text-[#0b1c30]">
        <span className="truncate">{formatDateValue(value)}</span>
      </span>
      <input
        aria-label={label}
        className="absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0"
        onChange={(event) => onChange(event.target.value)}
        type="date"
        value={value}
      />
      <Icon className="pointer-events-none absolute right-3 top-1/2 z-20 size-4 -translate-y-1/2 text-[#76777d]" name="chevronDown" />
    </label>
  );
}

export function DateRangeField({ fromValue, label, onFromChange, onToChange, toValue }: DateRangeFieldProps) {
  return (
    <fieldset className="min-w-0">
      <legend className="sr-only">{label}</legend>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <DateRangeInput label={`${label} from`} onChange={onFromChange} value={fromValue} />
        <DateRangeInput label={`${label} to`} onChange={onToChange} value={toValue} />
      </div>
    </fieldset>
  );
}
