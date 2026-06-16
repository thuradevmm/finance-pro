export function ProgressCircle({
  label,
  percent,
  tone = "text-[#0058be]",
}: {
  label?: string;
  percent: number;
  tone?: string;
}) {
  const clampedPercent = Math.max(0, Math.min(percent, 100));

  return (
    <div className="relative mx-auto size-48">
      <svg aria-hidden="true" className="size-full -rotate-90" viewBox="0 0 36 36">
        <path
          className="stroke-[#e5eeff]"
          d="M18 2.0845a15.9155 15.9155 0 0 1 0 31.831a15.9155 15.9155 0 0 1 0-31.831"
          fill="none"
          strokeWidth="3.8"
        />
        <path
          className={`stroke-current ${tone}`}
          d="M18 2.0845a15.9155 15.9155 0 0 1 0 31.831a15.9155 15.9155 0 0 1 0-31.831"
          fill="none"
          strokeDasharray={`${clampedPercent}, 100`}
          strokeLinecap="round"
          strokeWidth="2.8"
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center">
        <span className="text-2xl font-bold text-[#0b1c30]">{label ?? `${clampedPercent}%`}</span>
      </div>
    </div>
  );
}
