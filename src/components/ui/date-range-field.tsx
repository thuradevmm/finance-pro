import { DateInput } from "@/components/ui/date-input";

type DateRangeFieldProps = {
  fromName?: string;
  label: string;
  fromValue: string;
  onFromChange: (value: string) => void;
  onToChange: (value: string) => void;
  toName?: string;
  toValue: string;
};

export function DateRangeField({ fromName, fromValue, label, onFromChange, onToChange, toName, toValue }: DateRangeFieldProps) {
  return (
    <fieldset className="min-w-0">
      <legend className="sr-only">{label}</legend>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <DateInput label={`${label} from`} name={fromName} onChange={onFromChange} size="compact" value={fromValue} />
        <DateInput label={`${label} to`} name={toName} onChange={onToChange} size="compact" value={toValue} />
      </div>
    </fieldset>
  );
}
