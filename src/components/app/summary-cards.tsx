import { Icon } from "@/components/ui/icon";
import type { SummaryMetric } from "@/types/finance";

type SummaryCardsProps = {
  summaries: SummaryMetric[];
};

export function SummaryCards({ summaries }: SummaryCardsProps) {
  return (
    <section className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {summaries.map((summary) => (
        <div className="rounded-lg border border-[#c6c6cd]/60 bg-white p-4 shadow-sm" key={summary.label}>
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase text-[#45464d]">{summary.label}</p>
              <p className={`mt-2 text-2xl font-semibold ${summary.tone}`}>{summary.value}</p>
            </div>
            <span className={`grid size-10 place-items-center rounded-md ${summary.bg} ${summary.tone}`}>
              <Icon name={summary.icon} />
            </span>
          </div>
        </div>
      ))}
    </section>
  );
}
