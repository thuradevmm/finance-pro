import { DateInput } from "@/components/ui/date-input";

type DateRangeFieldProps = {
  label: string;
  fromValue: string;
  onFromChange: (value: string) => void;
  onToChange: (value: string) => void;
  toValue: string;
};

export function DateRangeField({ fromValue, label, onFromChange, onToChange, toValue }: DateRangeFieldProps) {
  return (
    <fieldset className="min-w-0">
      <legend className="sr-only">{label}</legend>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <DateInput label={`${label} from`} onChange={onFromChange} size="compact" value={fromValue} />
        <DateInput label={`${label} to`} onChange={onToChange} size="compact" value={toValue} />
      </div>
    </fieldset>
  );
}
