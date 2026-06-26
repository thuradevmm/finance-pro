import type { ButtonHTMLAttributes, ReactNode } from "react";

export function LoadingSpinner({ className = "size-4" }: { className?: string }) {
  return <span aria-hidden="true" className={`${className} animate-spin rounded-full border-2 border-current border-r-transparent`} />;
}

export function LoadingButton({
  children,
  isLoading,
  loadingLabel = "Working…",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
  isLoading: boolean;
  loadingLabel?: string;
}) {
  return (
    <button {...props} disabled={props.disabled || isLoading}>
      {isLoading ? <><LoadingSpinner /><span>{loadingLabel}</span></> : children}
    </button>
  );
}

export function LoadingOverlay({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="fixed inset-0 z-[100] grid place-items-center bg-[#0b1c30]/25 p-4 backdrop-blur-[2px]" role="status">
      <div className="flex items-center gap-3 rounded-lg border border-white/60 bg-white px-5 py-4 text-sm font-semibold text-[#0b1c30] shadow-[0_20px_60px_rgba(15,23,42,0.25)]">
        <LoadingSpinner className="size-5 text-[#0058be]" />
        <span>{label}</span>
      </div>
    </div>
  );
}

export function NavigationProgress({ label = "Loading workspace" }: { label?: string }) {
  return (
    <div className="fixed left-0 right-0 top-0 z-[110] h-1 bg-[#dce9ff]" role="status" aria-label={label}>
      <div className="h-full w-1/3 animate-[finance-progress_1.2s_ease-in-out_infinite] bg-[#2170e4] shadow-[0_0_16px_rgba(33,112,228,0.45)]" />
    </div>
  );
}

export type FinancialSkeletonRouteKind =
  | "dashboard"
  | "detail"
  | "form"
  | "report"
  | "settings"
  | "subscriptions"
  | "table";

function SkeletonBlock({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-md bg-[#d9e2f2] ${className}`} />;
}

function HeaderSkeleton({ action = true }: { action?: boolean }) {
  return (
    <div className="mb-6 flex flex-col justify-between gap-4 md:flex-row md:items-end">
      <div>
        <SkeletonBlock className="h-8 w-56" />
        <SkeletonBlock className="mt-3 h-4 w-80 max-w-full" />
      </div>
      {action ? <SkeletonBlock className="h-10 w-40" /> : null}
    </div>
  );
}

function SummarySkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {Array.from({ length: count }, (_, index) => (
        <div className="rounded-lg border border-[#c6c6cd]/60 bg-white p-4 shadow-sm" key={index}>
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <SkeletonBlock className="h-3 w-28" />
              <SkeletonBlock className="mt-3 h-7 w-36" />
            </div>
            <SkeletonBlock className="size-10 rounded-md" />
          </div>
        </div>
      ))}
    </div>
  );
}

function TableSkeleton({ rows = 6, columns = 4 }: { rows?: number; columns?: number }) {
  return (
    <div className="overflow-hidden rounded-lg border border-[#c6c6cd]/70 bg-white shadow-[0_4px_20px_rgba(15,23,42,0.04)]">
      <div className="border-b border-[#c6c6cd]/60 bg-[#eff4ff] px-4 py-3">
        <SkeletonBlock className="h-4 w-48" />
      </div>
      <div className="divide-y divide-[#c6c6cd]/40">
        {Array.from({ length: rows }, (_, rowIndex) => (
          <div className={`grid gap-4 px-4 py-4 ${columns >= 5 ? "grid-cols-5" : "grid-cols-4"}`} key={rowIndex}>
            <SkeletonBlock className="col-span-2 h-5" />
            {Array.from({ length: columns - 2 }, (_, columnIndex) => (
              <SkeletonBlock className="h-5" key={columnIndex} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function FormSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
      <div className="space-y-6 lg:col-span-8">
        {Array.from({ length: 2 }, (_, cardIndex) => (
          <section className="rounded-lg border border-[#c6c6cd]/60 bg-white p-5 shadow-[0_4px_20px_rgba(15,23,42,0.04)]" key={cardIndex}>
            <SkeletonBlock className="mb-5 h-6 w-44" />
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {Array.from({ length: cardIndex === 0 ? 6 : 2 }, (_, fieldIndex) => (
                <div key={fieldIndex}>
                  <SkeletonBlock className="mb-2 h-3 w-28" />
                  <SkeletonBlock className="h-12 w-full rounded-lg" />
                </div>
              ))}
            </div>
          </section>
        ))}
        <div className="flex flex-col-reverse justify-end gap-3 sm:flex-row">
          <SkeletonBlock className="h-10 w-24" />
          <SkeletonBlock className="h-10 w-36" />
          <SkeletonBlock className="h-10 w-40" />
        </div>
      </div>
      <aside className="hidden lg:col-span-4 lg:block">
        <div className="sticky top-24 rounded-lg border border-[#c6c6cd]/60 bg-[#eff4ff] p-6 shadow-[0_4px_20px_rgba(15,23,42,0.04)]">
          <div className="rounded-lg border border-[#c6c6cd]/60 bg-white p-5">
            <SkeletonBlock className="h-12 w-full" />
            <SkeletonBlock className="mt-5 h-24 w-full" />
            <SkeletonBlock className="mt-5 h-40 w-full" />
          </div>
        </div>
      </aside>
    </div>
  );
}

function SubscriptionSkeleton() {
  return (
    <>
      <SummarySkeleton />
      <section className="mb-6 rounded-lg border border-[#c6c6cd]/70 bg-white p-5 shadow-[0_4px_20px_rgba(15,23,42,0.04)]">
        <div className="mb-4 flex items-center justify-between gap-4">
          <div className="min-w-0 flex-1">
            <SkeletonBlock className="h-6 w-56" />
            <SkeletonBlock className="mt-2 h-4 w-96 max-w-full" />
          </div>
          <SkeletonBlock className="size-10 rounded-lg" />
        </div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }, (_, index) => (
            <SkeletonBlock className="h-32 w-full" key={index} />
          ))}
        </div>
      </section>
      <section className="mb-6">
        <SkeletonBlock className="mb-3 h-6 w-64" />
        <div className="flex gap-4 overflow-hidden pb-3">
          {Array.from({ length: 3 }, (_, index) => (
            <SkeletonBlock className="h-32 w-72 shrink-0" key={index} />
          ))}
        </div>
      </section>
      <TableSkeleton columns={5} />
    </>
  );
}

function DashboardSkeleton() {
  return (
    <>
      <SummarySkeleton />
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <SkeletonBlock className="h-80 rounded-lg xl:col-span-2" />
        <SkeletonBlock className="h-80 rounded-lg" />
        <SkeletonBlock className="h-72 rounded-lg" />
        <SkeletonBlock className="h-72 rounded-lg xl:col-span-2" />
      </div>
    </>
  );
}

function SettingsSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      <SkeletonBlock className="h-72 rounded-lg" />
      <SkeletonBlock className="h-72 rounded-lg" />
      <SkeletonBlock className="h-72 rounded-lg" />
    </div>
  );
}

function ReportSkeleton() {
  return (
    <>
      <SummarySkeleton count={3} />
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <SkeletonBlock className="h-80 rounded-lg" />
        <SkeletonBlock className="h-80 rounded-lg" />
      </div>
    </>
  );
}

function DetailSkeleton() {
  return (
    <div className="rounded-lg border border-[#c6c6cd]/70 bg-white p-6 shadow-[0_4px_20px_rgba(15,23,42,0.04)]">
      <SkeletonBlock className="h-8 w-64" />
      <SkeletonBlock className="mt-5 h-4 w-full max-w-2xl" />
      <SkeletonBlock className="mt-3 h-4 w-full max-w-xl" />
      <div className="mt-8 grid gap-4 md:grid-cols-2">
        <SkeletonBlock className="h-40 rounded-lg" />
        <SkeletonBlock className="h-40 rounded-lg" />
      </div>
    </div>
  );
}

function RouteBodySkeleton({ kind }: { kind: FinancialSkeletonRouteKind }) {
  if (kind === "dashboard") return <DashboardSkeleton />;
  if (kind === "form") return <FormSkeleton />;
  if (kind === "report") return <ReportSkeleton />;
  if (kind === "settings") return <SettingsSkeleton />;
  if (kind === "subscriptions") return <SubscriptionSkeleton />;
  if (kind === "detail") return <DetailSkeleton />;
  return (
    <>
      <SummarySkeleton />
      <TableSkeleton columns={5} />
    </>
  );
}

export function FinancialPageSkeleton({
  routeKind = "table",
  sidebarCollapsed = false,
}: {
  routeKind?: FinancialSkeletonRouteKind;
  sidebarCollapsed?: boolean;
}) {
  return (
    <div className="min-h-screen bg-[#f8f9ff] text-[#0b1c30]" role="status" aria-label="Loading financial workspace">
      <NavigationProgress />
      <div className="flex min-h-screen">
        <aside className={`${sidebarCollapsed ? "w-20 px-3" : "w-64 px-6"} hidden shrink-0 border-r border-[#c6c6cd]/70 bg-white py-6 transition-[width] duration-200 md:block`}>
          <SkeletonBlock className={sidebarCollapsed ? "mx-auto h-7 w-10" : "h-7 w-32"} />
          {sidebarCollapsed ? null : <SkeletonBlock className="mt-2 h-3 w-28" />}
          <div className="mt-8 space-y-2">
            {Array.from({ length: 9 }, (_, index) => (
              <SkeletonBlock className={sidebarCollapsed ? "mx-auto size-10" : "h-10 w-full"} key={index} />
            ))}
          </div>
        </aside>
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-20 hidden h-16 items-center justify-between border-b border-[#c6c6cd]/70 bg-white/95 px-8 md:flex">
            <SkeletonBlock className="h-10 w-full max-w-xl" />
            <div className="flex items-center gap-3">
              <SkeletonBlock className="size-10 rounded-full" />
              <SkeletonBlock className="h-10 w-28 rounded-full" />
            </div>
          </header>
          <header className="sticky top-0 z-20 border-b border-[#c6c6cd]/70 bg-white/95 px-4 py-4 md:hidden">
            <div className="flex items-center justify-between gap-3">
              <SkeletonBlock className="size-10" />
              <SkeletonBlock className="h-9 flex-1" />
              <SkeletonBlock className="size-10" />
            </div>
            <SkeletonBlock className="mt-4 h-10 w-full" />
          </header>
          <main className="mx-auto w-full max-w-[1440px] flex-1 px-4 py-6 md:px-8 md:py-8">
            <HeaderSkeleton action={routeKind !== "settings" && routeKind !== "detail"} />
            <RouteBodySkeleton kind={routeKind} />
          </main>
        </div>
      </div>
    </div>
  );
}
