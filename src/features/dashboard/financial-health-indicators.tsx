import { Icon, type IconName } from "@/components/ui/icon";
import type { FinancialHealthSignal } from "@/lib/dashboard/health-indicators";

const signalStyle: Record<FinancialHealthSignal["signal"], { badge: string; card: string; icon: IconName }> = {
  Building: { badge: "bg-[#eff6ff] text-[#0058be]", card: "border-[#bfdbfe] bg-[#fbfdff]", icon: "timeline" },
  Healthy: { badge: "bg-[#ecfdf5] text-[#166534]", card: "border-[#bbf7d0] bg-[#fbfffc]", icon: "check" },
  "Setup needed": { badge: "bg-[#f1f1f4] text-[#45464d]", card: "border-[#c6c6cd] bg-[#f8f9ff]", icon: "settings" },
  Warning: { badge: "bg-[#fff1f0] text-[#991b1b]", card: "border-[#fecaca] bg-[#fffafa]", icon: "trendingDown" },
  Watch: { badge: "bg-[#fffbeb] text-[#92400e]", card: "border-[#fde68a] bg-[#fffdf7]", icon: "eye" },
  Winning: { badge: "bg-[#dcfce7] text-[#166534]", card: "border-[#86efac] bg-[#f0fdf4]", icon: "trendingUp" },
};

export function FinancialHealthIndicators({ signals }: { signals: FinancialHealthSignal[] }) {
  return (
    <section className="mb-6" aria-labelledby="financial-health-title">
      <div className="mb-3">
        <p className="text-xs font-bold uppercase tracking-[0.12em] text-[#0058be]">At-a-glance signals</p>
        <h2 className="mt-1 text-xl font-semibold text-[#0b1c30]" id="financial-health-title">Financial health indicators</h2>
        <p className="mt-1 text-sm leading-6 text-[#45464d]">Qualitative signals use the selected date range and your super-category purposes. They guide attention without exposing another wall of numbers.</p>
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 2xl:grid-cols-4">
        {signals.map((item) => {
          const style = signalStyle[item.signal];
          return (
            <article className={`rounded-lg border p-4 ${style.card}`} key={item.label}>
              <div className="flex items-start justify-between gap-3">
                <span className="grid size-10 place-items-center rounded-full bg-white text-[#0b1c30]"><Icon className="size-5" name={style.icon} /></span>
                <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${style.badge}`}>{item.signal}</span>
              </div>
              <h3 className="mt-4 font-semibold text-[#0b1c30]">{item.label}</h3>
              <p className="mt-1 text-xs font-medium leading-5 text-[#45464d]">{item.detail}</p>
            </article>
          );
        })}
      </div>
    </section>
  );
}
