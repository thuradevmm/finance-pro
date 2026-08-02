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
      <div className="flex max-w-[calc(100vw-2rem)] items-center gap-3 rounded-lg border border-white/60 bg-white px-5 py-4 text-sm font-semibold text-[#0b1c30] shadow-[0_20px_60px_rgba(15,23,42,0.25)]">
        <LoadingSpinner className="size-5 text-[#0058be]" />
        <span className="min-w-0 break-words">{label}</span>
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
  | "accounts"
  | "assets"
  | "auth"
  | "categories"
  | "coming-soon"
  | "dashboard"
  | "debts"
  | "detail"
  | "form"
  | "notifications"
  | "savings-goals"
  | "status"
  | "subscriptions"
  | "table"
  | "transactions"
  | "planning";

function SkeletonBlock({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-md bg-[#d9e2f2] ${className}`} />;
}

function HeaderSkeleton({ action = true }: { action?: boolean }) {
  return (
    <div className="mb-6 flex min-w-0 flex-col justify-between gap-4 md:flex-row md:items-end">
      <div className="min-w-0">
        <SkeletonBlock className="h-8 w-56" />
        <SkeletonBlock className="mt-3 h-4 w-80 max-w-full" />
      </div>
      {action ? <SkeletonBlock className="h-10 w-full sm:w-40" /> : null}
    </div>
  );
}

function SummarySkeleton({ columns = 4, count = 4 }: { columns?: 3 | 4 | 6; count?: number }) {
  const columnClassName = columns === 3
    ? "md:grid-cols-3"
    : columns === 6
      ? "lg:grid-cols-3 2xl:grid-cols-6"
      : "xl:grid-cols-4";
  return (
    <div className={`mb-5 grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 ${columnClassName}`}>
      {Array.from({ length: count }, (_, index) => (
        <div className="rounded-lg border border-[#c6c6cd]/60 bg-white px-4 py-3 shadow-sm" key={index}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <SkeletonBlock className="h-3 w-28" />
              <SkeletonBlock className="mt-2 h-7 w-36" />
            </div>
            <SkeletonBlock className="size-9 rounded-md" />
          </div>
        </div>
      ))}
    </div>
  );
}

function TableSkeleton({ rows = 6, columns = 4 }: { rows?: number; columns?: number }) {
  return (
    <div className="min-w-0 overflow-hidden rounded-lg border border-[#c6c6cd]/70 bg-white shadow-[0_4px_20px_rgba(15,23,42,0.04)]">
      <div className="border-b border-[#c6c6cd]/60 bg-[#eff4ff] px-4 py-3">
        <SkeletonBlock className="h-4 w-48" />
      </div>
      <div className="divide-y divide-[#c6c6cd]/40">
        {Array.from({ length: rows }, (_, rowIndex) => (
          <div className={`grid min-w-0 gap-4 px-4 py-4 ${columns >= 5 ? "grid-cols-2 sm:grid-cols-5" : "grid-cols-2 sm:grid-cols-4"}`} key={rowIndex}>
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

function FilterSkeleton({ fields = 5, layout = "wide" }: { fields?: number; layout?: "compact" | "wide" }) {
  const compactGridClassName = fields > 1
    ? "lg:grid-cols-[minmax(0,1fr)_minmax(12rem,0.35fr)_auto] lg:items-end"
    : "lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end";
  return (
    <div className="mb-6 rounded-lg border border-[#c6c6cd]/60 bg-white p-4 shadow-sm">
      <div className={`grid grid-cols-1 gap-3 ${layout === "compact" ? compactGridClassName : "sm:grid-cols-2 xl:grid-cols-6"}`}>
        {Array.from({ length: fields }, (_, index) => (
          <div className={layout === "wide" && index === 0 ? "sm:col-span-2" : ""} key={index}>
            <SkeletonBlock className="mb-2 h-3 w-24" />
            <SkeletonBlock className="h-12 w-full rounded-lg" />
          </div>
        ))}
        {layout === "compact" ? <div className="flex justify-end gap-2"><SkeletonBlock className="h-11 w-24" /><SkeletonBlock className="h-11 w-28" /></div> : null}
      </div>
      {layout === "wide" ? <div className="mt-3 flex justify-end gap-2">
        <SkeletonBlock className="h-11 w-24" />
        <SkeletonBlock className="h-11 w-28" />
      </div> : null}
    </div>
  );
}

function FormSkeleton() {
  return (
    <div className="grid min-w-0 grid-cols-1 gap-6 xl:grid-cols-12">
      <div className="min-w-0 space-y-6 xl:col-span-8">
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
      <aside className="hidden min-w-0 xl:col-span-4 xl:block">
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

function PanelHeadingSkeleton({ width = "w-48" }: { width?: string }) {
  return (
    <div className="mb-4 flex items-start justify-between gap-4">
      <div className="min-w-0 flex-1">
        <SkeletonBlock className={`h-6 ${width} max-w-full`} />
        <SkeletonBlock className="mt-2 h-4 w-80 max-w-full" />
      </div>
      <SkeletonBlock className="size-11 shrink-0 rounded-lg" />
    </div>
  );
}

function AssetSkeleton() {
  return (
    <>
      <SummarySkeleton columns={3} count={3} />
      <FilterSkeleton fields={2} layout="compact" />
      <section className="overflow-hidden rounded-lg border border-[#c6c6cd]/70 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-[#c6c6cd]/50 bg-[#f8f9ff] px-4 py-3 sm:flex-row sm:items-end sm:justify-between">
          <div><SkeletonBlock className="h-3 w-28" /><SkeletonBlock className="mt-2 h-4 w-36" /></div>
          <div className="flex items-end gap-2"><SkeletonBlock className="h-12 w-40" /><SkeletonBlock className="size-12" /></div>
        </div>
        <div className="hidden divide-y divide-[#c6c6cd]/40 xl:block">
          {Array.from({ length: 6 }, (_, rowIndex) => <div className="grid grid-cols-[1.4fr_repeat(6,1fr)_auto] gap-4 px-4 py-4" key={rowIndex}>{Array.from({ length: 8 }, (_, columnIndex) => <SkeletonBlock className="h-5" key={columnIndex} />)}</div>)}
        </div>
        <div className="grid gap-3 p-4 sm:grid-cols-2 xl:hidden">
          {Array.from({ length: 4 }, (_, index) => <SkeletonBlock className="h-64 w-full" key={index} />)}
        </div>
      </section>
    </>
  );
}

function CategoriesSkeleton() {
  return (
    <>
      <SummarySkeleton />
      <FilterSkeleton fields={4} />
      <div className="mb-6 flex gap-2 overflow-hidden rounded-lg bg-[#e8edf7] p-1.5">
        {Array.from({ length: 5 }, (_, index) => <SkeletonBlock className="h-10 w-36 shrink-0" key={index} />)}
      </div>
      <section className="space-y-3">
        {Array.from({ length: 5 }, (_, index) => (
          <article className="grid min-w-0 gap-4 rounded-lg border border-[#c6c6cd]/60 bg-white p-4 xl:grid-cols-[minmax(16rem,1.5fr)_minmax(11rem,1fr)_minmax(11rem,0.7fr)_auto] xl:items-center sm:p-5" key={index}>
            <div className="flex items-center gap-3"><SkeletonBlock className="size-11 shrink-0 rounded-full" /><div className="min-w-0 flex-1"><SkeletonBlock className="h-5 w-40 max-w-full" /><SkeletonBlock className="mt-2 h-4 w-64 max-w-full" /></div></div>
            <div className="flex gap-2"><SkeletonBlock className="h-7 w-24" /><SkeletonBlock className="h-7 w-20" /></div>
            <div><SkeletonBlock className="h-3 w-28" /><SkeletonBlock className="mt-2 h-6 w-32" /></div>
            <div className="flex justify-end gap-2"><SkeletonBlock className="size-11 rounded-full" /><SkeletonBlock className="size-11 rounded-full" /></div>
          </article>
        ))}
      </section>
    </>
  );
}

function SavingsGoalsSkeleton() {
  return (
    <>
      <SummarySkeleton />
      <FilterSkeleton fields={1} layout="compact" />
      <section className="grid min-w-0 grid-cols-1 gap-6 lg:grid-cols-2 2xl:grid-cols-3">
        {Array.from({ length: 3 }, (_, index) => (
          <article className="rounded-lg border border-[#c6c6cd]/60 bg-white p-5" key={index}>
            <div className="flex items-center justify-between gap-3 border-b border-[#c6c6cd]/40 pb-4"><div className="flex min-w-0 flex-1 items-center gap-3"><SkeletonBlock className="size-10 shrink-0" /><div className="min-w-0 flex-1"><SkeletonBlock className="h-6 w-40 max-w-full" /><SkeletonBlock className="mt-2 h-3 w-28" /></div></div><SkeletonBlock className="h-7 w-20" /></div>
            <SkeletonBlock className="mx-auto mt-5 size-36 rounded-full" />
            <div className="mt-5 grid grid-cols-2 gap-3"><SkeletonBlock className="h-16" /><SkeletonBlock className="h-16" /></div>
            <SkeletonBlock className="mt-5 h-20 w-full" />
          </article>
        ))}
      </section>
    </>
  );
}

function DebtsSkeleton() {
  return (
    <>
      <SummarySkeleton count={5} />
      <FilterSkeleton fields={2} layout="compact" />
      <div className="grid min-w-0 grid-cols-1 gap-6 xl:grid-cols-12">
        <div className="min-w-0 xl:col-span-9"><TableSkeleton columns={5} rows={7} /></div>
        <aside className="min-w-0 rounded-lg border border-[#c6c6cd]/70 bg-white p-5 xl:col-span-3">
          <PanelHeadingSkeleton width="w-44" />
          <div className="space-y-3">{Array.from({ length: 4 }, (_, index) => <SkeletonBlock className="h-24 w-full" key={index} />)}</div>
          <SkeletonBlock className="mt-5 h-11 w-full" />
        </aside>
      </div>
    </>
  );
}

function SubscriptionSkeleton() {
  return (
    <>
      <SummarySkeleton />
      <FilterSkeleton fields={1} layout="compact" />
      <section className="mb-6 rounded-lg border border-[#c6c6cd]/70 bg-white p-5 shadow-[0_4px_20px_rgba(15,23,42,0.04)]">
        <PanelHeadingSkeleton width="w-56" />
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }, (_, index) => (
            <SkeletonBlock className="h-32 w-full" key={index} />
          ))}
        </div>
      </section>
      <section className="mb-6 grid gap-4 lg:grid-cols-2">
        {Array.from({ length: 2 }, (_, index) => <div className="rounded-lg border border-[#c6c6cd]/70 bg-white p-5" key={index}><PanelHeadingSkeleton /><div className="space-y-3"><SkeletonBlock className="h-16" /><SkeletonBlock className="h-16" /></div></div>)}
      </section>
      <section className="mb-6">
        <SkeletonBlock className="mb-3 h-6 w-64" />
        <div className="flex max-w-full gap-4 overflow-hidden pb-3">
          {Array.from({ length: 3 }, (_, index) => (
            <SkeletonBlock className="h-32 w-[min(18rem,calc(100vw-2rem))] shrink-0 sm:w-72" key={index} />
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
      <section className="overflow-hidden rounded-xl border border-[#c6c6cd]/70 bg-white">
        <div className="border-b border-[#c6c6cd]/50 bg-[#eff6ff] p-4 sm:p-6">
          <SkeletonBlock className="h-6 w-72 max-w-full" />
          <SkeletonBlock className="mt-3 h-4 w-full max-w-2xl" />
          <SkeletonBlock className="mt-5 h-24 w-full rounded-lg" />
        </div>
        <div className="p-4 sm:p-6">
          <SummarySkeleton columns={3} count={3} />
          <TableSkeleton columns={4} rows={10} />
          <SkeletonBlock className="mt-5 h-28 w-full rounded-lg" />
        </div>
      </section>
    </>
  );
}

function AccountsSkeleton() {
  return (
    <>
      <SummarySkeleton count={5} />
      <FilterSkeleton fields={6} />
      <div className="space-y-6">
        <TableSkeleton columns={5} rows={4} />
        <TableSkeleton columns={5} rows={3} />
      </div>
    </>
  );
}

function TransactionsSkeleton() {
  return (
    <>
      <div className="mb-4 flex gap-3 border-b border-[#c6c6cd]/60 pb-2">
        {Array.from({ length: 4 }, (_, index) => <SkeletonBlock className="h-9 w-20" key={index} />)}
      </div>
      <FilterSkeleton fields={6} />
      <TableSkeleton columns={5} rows={8} />
    </>
  );
}

function PlanningSkeleton() {
  return (
    <>
      <div className="mb-6 grid gap-4 xl:grid-cols-2">
        <section className="rounded-lg border border-[#c6c6cd]/70 bg-white p-5">
          <PanelHeadingSkeleton width="w-40" />
          <div className="grid gap-3 sm:grid-cols-2"><SkeletonBlock className="h-12" /><SkeletonBlock className="h-12" /><SkeletonBlock className="h-12" /><SkeletonBlock className="h-12" /></div>
          <SkeletonBlock className="mt-4 h-11 w-36" />
        </section>
        <section className="rounded-lg border border-[#c6c6cd]/70 bg-white p-5">
          <PanelHeadingSkeleton width="w-52" />
          <div className="space-y-3">
            {Array.from({ length: 3 }, (_, index) => <div className="rounded-lg border border-[#c6c6cd]/50 p-3" key={index}><SkeletonBlock className="h-4 w-28" /><div className="mt-3 grid gap-3 sm:grid-cols-[minmax(0,1fr)_8rem_auto]"><SkeletonBlock className="h-12" /><SkeletonBlock className="h-12" /><SkeletonBlock className="h-12 w-20" /></div></div>)}
          </div>
        </section>
      </div>
      <section>
        <div className="mb-3 flex items-end justify-between gap-3"><div><SkeletonBlock className="h-6 w-56" /><SkeletonBlock className="mt-2 h-4 w-80 max-w-full" /></div><SkeletonBlock className="h-11 w-36" /></div>
        <TableSkeleton columns={5} rows={8} />
      </section>
    </>
  );
}

function NotificationsSkeleton() {
  return (
    <>
      <div className="mb-5 flex gap-2"><SkeletonBlock className="h-7 w-24 rounded-full" /><SkeletonBlock className="h-7 w-24 rounded-full" /></div>
      <section className="space-y-3">
        {Array.from({ length: 5 }, (_, index) => (
          <article className="flex min-w-0 flex-col gap-4 rounded-lg border border-[#c6c6cd]/70 bg-white p-4 sm:flex-row sm:items-center sm:justify-between" key={index}>
            <div className="flex min-w-0 flex-1 items-start gap-3"><SkeletonBlock className="size-10 shrink-0 rounded-lg" /><div className="min-w-0 flex-1"><div className="flex gap-2"><SkeletonBlock className="h-5 w-48 max-w-full" /><SkeletonBlock className="h-5 w-16" /></div><SkeletonBlock className="mt-2 h-4 w-full max-w-2xl" /><SkeletonBlock className="mt-2 h-3 w-24" /></div></div>
            <SkeletonBlock className="h-11 w-24 shrink-0" />
          </article>
        ))}
      </section>
    </>
  );
}

function AuthSkeleton() {
  return (
    <div className="grid min-h-dvh place-items-center bg-[#f8f9ff] p-4" role="status" aria-label="Loading secure account page">
      <NavigationProgress />
      <div className="w-full max-w-md rounded-xl border border-[#c6c6cd]/70 bg-white p-6 shadow-[0_16px_50px_rgba(15,23,42,0.10)]">
        <SkeletonBlock className="mx-auto size-12 rounded-xl" />
        <SkeletonBlock className="mx-auto mt-5 h-8 w-52" />
        <SkeletonBlock className="mx-auto mt-3 h-4 w-72 max-w-full" />
        <div className="mt-7 space-y-4">
          <SkeletonBlock className="h-12 w-full rounded-lg" />
          <SkeletonBlock className="h-12 w-full rounded-lg" />
          <SkeletonBlock className="h-11 w-full rounded-lg" />
        </div>
      </div>
    </div>
  );
}

function StatusSkeleton() {
  return (
    <div className="grid min-h-dvh place-items-center bg-[#f8f9ff] p-4" role="status" aria-label="Loading status page">
      <NavigationProgress />
      <div className="w-full max-w-lg rounded-xl border border-[#c6c6cd]/70 bg-white p-8 text-center shadow-[0_16px_50px_rgba(15,23,42,0.10)]">
        <SkeletonBlock className="mx-auto size-14 rounded-full" />
        <SkeletonBlock className="mx-auto mt-5 h-5 w-28" />
        <SkeletonBlock className="mx-auto mt-4 h-8 w-72 max-w-full" />
        <SkeletonBlock className="mx-auto mt-4 h-16 w-full" />
        <SkeletonBlock className="mx-auto mt-6 h-11 w-40" />
      </div>
    </div>
  );
}

function ComingSoonSkeleton() {
  return (
    <section className="grid min-h-[420px] place-items-center rounded-xl border border-[#c6c6cd]/70 bg-white p-6 text-center shadow-sm">
      <div className="w-full max-w-xl">
        <SkeletonBlock className="mx-auto size-14 rounded-xl" />
        <SkeletonBlock className="mx-auto mt-5 h-8 w-64 max-w-full" />
        <SkeletonBlock className="mx-auto mt-4 h-16 w-full" />
      </div>
    </section>
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
  if (kind === "accounts") return <AccountsSkeleton />;
  if (kind === "assets") return <AssetSkeleton />;
  if (kind === "categories") return <CategoriesSkeleton />;
  if (kind === "debts") return <DebtsSkeleton />;
  if (kind === "savings-goals") return <SavingsGoalsSkeleton />;
  if (kind === "transactions") return <TransactionsSkeleton />;
  if (kind === "planning") return <PlanningSkeleton />;
  if (kind === "notifications") return <NotificationsSkeleton />;
  if (kind === "coming-soon") return <ComingSoonSkeleton />;
  if (kind === "dashboard") return <DashboardSkeleton />;
  if (kind === "form") return <FormSkeleton />;
  if (kind === "subscriptions") return <SubscriptionSkeleton />;
  if (kind === "detail") return <DetailSkeleton />;
  return (
    <>
      <SummarySkeleton />
      <FilterSkeleton />
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
  if (routeKind === "auth") return <AuthSkeleton />;
  if (routeKind === "status") return <StatusSkeleton />;
  return (
    <div className="min-h-dvh bg-[#f8f9ff] text-[#0b1c30]" role="status" aria-label="Loading financial workspace">
      <NavigationProgress />
      <div className="flex min-h-dvh min-w-0">
        <aside className={`${sidebarCollapsed ? "w-20 px-3" : "w-64 px-6"} hidden shrink-0 border-r border-[#c6c6cd]/70 bg-white py-6 transition-[width] duration-200 lg:block`}>
          <SkeletonBlock className={sidebarCollapsed ? "mx-auto h-7 w-10" : "h-7 w-32"} />
          {sidebarCollapsed ? null : <SkeletonBlock className="mt-2 h-3 w-28" />}
          <div className="mt-8 space-y-4">
            {[4, 3, 2].map((itemCount, groupIndex) => (
              <div className={groupIndex === 0 ? "space-y-1" : "space-y-1 border-t border-[#c6c6cd]/40 pt-4"} key={groupIndex}>
                {Array.from({ length: itemCount }, (_, index) => <SkeletonBlock className={sidebarCollapsed ? "mx-auto size-11" : "h-11 w-full"} key={index} />)}
              </div>
            ))}
          </div>
        </aside>
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-20 hidden h-16 items-center justify-between border-b border-[#c6c6cd]/70 bg-white/95 px-8 lg:flex">
            <div />
            <div className="flex items-center gap-3">
              <SkeletonBlock className="size-10 rounded-full" />
              <SkeletonBlock className="h-10 w-28 rounded-full" />
            </div>
          </header>
          <header className="sticky top-0 z-20 border-b border-[#c6c6cd]/70 bg-white/95 px-4 py-4 lg:hidden">
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3"><SkeletonBlock className="size-11 shrink-0" /><SkeletonBlock className="h-6 w-28" /></div>
              <div className="flex shrink-0 gap-2"><SkeletonBlock className="size-11" /><SkeletonBlock className="size-11 rounded-full" /></div>
            </div>
            <SkeletonBlock className="mt-3 h-3 w-32" />
          </header>
          <main className="mx-auto min-w-0 w-full max-w-[1440px] flex-1 px-4 py-6 sm:px-5 md:px-6 lg:px-8 lg:py-8">
            <HeaderSkeleton action={!["coming-soon", "dashboard", "detail", "notifications"].includes(routeKind)} />
            <RouteBodySkeleton kind={routeKind} />
          </main>
        </div>
      </div>
    </div>
  );
}
