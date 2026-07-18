import { Icon } from "@/components/ui/icon";
import { ResponsiveAmount } from "@/components/ui/responsive-amount";
import type { SummaryMetric } from "@/types/finance";

type SummaryCardsProps = {
  summaries: SummaryMetric[];
};

export function SummaryCards({ summaries }: SummaryCardsProps) {
  return (
    <section className="mb-6 grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {summaries.map((summary) => (
        <div className="min-w-0 rounded-lg border border-[#c6c6cd]/60 bg-white p-4 shadow-sm" key={summary.label}>
          <div className="flex items-start justify-between gap-4">
            <p className="min-w-0 break-words text-xs font-semibold uppercase text-[#45464d]">{summary.label}</p>
            <span className={`grid size-11 shrink-0 place-items-center rounded-md ${summary.bg} ${summary.tone}`}>
              <Icon name={summary.icon} />
            </span>
          </div>
          <ResponsiveAmount className={`mt-2 font-semibold ${summary.tone}`} maxSizeRem={1.5} minSizeRem={1}>
            {summary.value}
          </ResponsiveAmount>
        </div>
      ))}
    </section>
  );
}
