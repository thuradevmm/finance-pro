type ProgressMeterProps = {
  ariaLabel: string;
  className?: string;
  colorClassName?: string;
  markerClassName?: string;
  markerPercent?: number;
  percent: number;
  trackClassName?: string;
};

function clampPercent(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(value, 100));
}

export function ProgressMeter({
  ariaLabel,
  className = "h-2",
  colorClassName = "bg-[#0058be]",
  markerClassName = "bg-[#45464d]/50",
  markerPercent,
  percent,
  trackClassName = "bg-[#dce9ff]",
}: ProgressMeterProps) {
  const clampedPercent = clampPercent(percent);
  const clampedMarkerPercent = markerPercent == null ? null : clampPercent(markerPercent);

  return (
    <div
      aria-label={ariaLabel}
      aria-valuemax={100}
      aria-valuemin={0}
      aria-valuenow={clampedPercent}
      className={`relative w-full overflow-hidden rounded-full ${trackClassName} ${className}`}
      role="progressbar"
    >
      <div className={`h-full rounded-full transition-all ${colorClassName}`} style={{ width: `${clampedPercent}%` }} />
      {clampedMarkerPercent == null ? null : (
        <div className={`absolute bottom-0 top-0 w-0.5 ${markerClassName}`} style={{ left: `${clampedMarkerPercent}%` }} />
      )}
    </div>
  );
}
