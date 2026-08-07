import { Icon, type IconName } from "@/components/ui/icon";
import type { FinancialHealthSignal } from "@/lib/dashboard/health-indicators";

const signalStyle: Record<FinancialHealthSignal["signal"], {
  accent: string;
  badge: string;
  card: string;
  icon: IconName;
}> = {
  Building: {
    accent: "text-[#0058be]",
    badge: "border-[#bfdbfe] bg-[#eff6ff] text-[#0058be]",
    card: "border-[#bfdbfe]",
    icon: "timeline",
  },
  Healthy: {
    accent: "text-[#15803d]",
    badge: "border-[#bbf7d0] bg-[#ecfdf5] text-[#166534]",
    card: "border-[#bbf7d0]",
    icon: "check",
  },
  "Setup needed": {
    accent: "text-[#6b7280]",
    badge: "border-[#d4d4d8] bg-[#f1f1f4] text-[#45464d]",
    card: "border-[#d4d4d8]",
    icon: "settings",
  },
  Warning: {
    accent: "text-[#dc2626]",
    badge: "border-[#fecaca] bg-[#fff1f0] text-[#991b1b]",
    card: "border-[#fecaca]",
    icon: "trendingDown",
  },
  Watch: {
    accent: "text-[#d97706]",
    badge: "border-[#fde68a] bg-[#fffbeb] text-[#92400e]",
    card: "border-[#fde68a]",
    icon: "eye",
  },
  Winning: {
    accent: "text-[#15803d]",
    badge: "border-[#86efac] bg-[#dcfce7] text-[#166534]",
    card: "border-[#86efac]",
    icon: "trendingUp",
  },
};

const gaugeSegments = [
  { color: "#16df35", path: "M25 100 A75 75 0 0 1 44.3 49.8" },
  { color: "#facc15", path: "M47.9 46 A75 75 0 0 1 97.4 25" },
  { color: "#fb923c", path: "M102.6 25 A75 75 0 0 1 152.1 46" },
  { color: "#ff2d2d", path: "M155.7 49.8 A75 75 0 0 1 175 100" },
];

function HealthDial({ score, signal }: Pick<FinancialHealthSignal, "score" | "signal">) {
  const isSetupNeeded = signal === "Setup needed";
  // The arc runs from healthy green on the left to warning red on the right.
  // A higher normalized health score therefore rotates the needle left.
  const needleAngle = score == null ? -90 : -18 - (Math.min(Math.max(score, 0), 100) / 100) * 144;
  const angle = needleAngle * (Math.PI / 180);
  const needleEnd = {
    x: 100 + Math.cos(angle) * 61,
    y: 100 + Math.sin(angle) * 61,
  };

  return (
    <div className="h-[6.75rem] w-44 shrink-0" data-signal={signal}>
      <svg
        aria-label={`${signal} indicator${score == null ? "" : `, score ${score} out of 100`}`}
        className={`h-full w-full overflow-visible drop-shadow-[0_4px_4px_rgba(15,23,42,0.16)] ${isSetupNeeded ? "opacity-45 grayscale" : ""}`}
        role="img"
        viewBox="0 0 200 120"
      >
        <title>{signal} indicator{score == null ? "" : `, score ${score} out of 100`}</title>
        <g aria-hidden="true" fill="none" strokeLinecap="butt">
          {gaugeSegments.map((segment) => (
            <path d={segment.path} key={`outline-${segment.color}`} stroke="#64748b" strokeOpacity="0.18" strokeWidth="30" />
          ))}
          {gaugeSegments.map((segment) => (
            <path d={segment.path} key={segment.color} stroke={segment.color} strokeWidth="25" />
          ))}
        </g>
        <line
          aria-hidden="true"
          className="transition-all duration-500"
          stroke="#34373b"
          strokeLinecap="round"
          strokeWidth="10"
          x1="100"
          x2={needleEnd.x}
          y1="100"
          y2={needleEnd.y}
        />
        <circle aria-hidden="true" cx="100" cy="100" fill="#787b80" r="12" stroke="#34373b" strokeWidth="4" />
      </svg>
    </div>
  );
}

export function FinancialHealthIndicators({ signals }: { signals: FinancialHealthSignal[] }) {
  return (
    <section className="mb-6" aria-labelledby="financial-health-title">
      <div className="mb-3">
        <p className="text-xs font-bold uppercase tracking-[0.12em] text-[#0058be]">At-a-glance signals</p>
        <h2 className="mt-1 text-xl font-semibold text-[#0b1c30]" id="financial-health-title">Financial health indicators</h2>
        <p className="mt-1 text-sm leading-6 text-[#45464d]">Qualitative signals use the selected date range, amount types, and super-category purposes. Their needles are normalized from 0–100 health scores.</p>
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 2xl:grid-cols-4">
        {signals.map((item) => {
          const style = signalStyle[item.signal];
          return (
            <article className={`rounded-xl border bg-white p-4 shadow-[0_4px_18px_rgba(15,23,42,0.04)] ${style.card}`} key={item.label}>
              <div className="flex items-center gap-4 sm:items-start md:flex-col md:items-center">
                <HealthDial score={item.score} signal={item.signal} />
                <div className="min-w-0 flex-1 md:text-center">
                  <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-bold ${style.badge}`}>
                    <Icon className="size-3.5" name={style.icon} />
                    {item.signal}
                  </span>
                  <h3 className="mt-2 font-semibold text-[#0b1c30]">{item.label}</h3>
                  <p className="mt-1 text-xs font-medium leading-5 text-[#45464d]">{item.detail}</p>
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
