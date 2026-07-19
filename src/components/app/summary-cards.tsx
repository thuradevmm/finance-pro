import { Icon } from "@/components/ui/icon";
import { ResponsiveAmount } from "@/components/ui/responsive-amount";
import type { SummaryMetric } from "@/types/finance";

type SummaryCardsProps = {
  summaries: SummaryMetric[];
};

export function SummaryCards({ summaries }: SummaryCardsProps) {
  return (
    <section className="mb-5 grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {summaries.map((summary) => (
        <div className="min-w-0 rounded-lg border border-[#c6c6cd]/60 bg-white px-4 py-3 shadow-sm" key={summary.label}>
          <div className="flex items-start justify-between gap-3">
            <p className="min-w-0 break-words text-xs font-semibold uppercase text-[#45464d]">{summary.label}</p>
            <span className={`grid size-9 shrink-0 place-items-center rounded-md ${summary.bg} ${summary.tone}`}>
              <Icon className="size-4" name={summary.icon} />
            </span>
          </div>
          <ResponsiveAmount className={`mt-1.5 font-semibold ${summary.tone}`} maxSizeRem={1.375} minSizeRem={1.25}>
            {summary.value}
          </ResponsiveAmount>
        </div>
      ))}
    </section>
  );
}
