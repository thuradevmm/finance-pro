import type { ReactNode } from "react";

import { Icon, type IconName } from "@/components/ui/icon";

type StatusPageProps = {
  actions?: ReactNode;
  badge: string;
  code?: string;
  description: string;
  details?: ReactNode;
  fullHeight?: boolean;
  icon: IconName;
  title: string;
};

export function StatusPage({ actions, badge, code, description, details, fullHeight = true, icon, title }: StatusPageProps) {
  return (
    <section
      className={`flex min-w-0 items-center justify-center bg-[radial-gradient(circle_at_top,_rgba(33,112,228,0.14),_transparent_40%),linear-gradient(180deg,#f8f9ff_0%,#edf3ff_100%)] pb-[max(2rem,env(safe-area-inset-bottom))] pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] pt-[max(2rem,env(safe-area-inset-top))] ${
        fullHeight ? "min-h-dvh" : "min-h-[60dvh]"
      }`}
    >
      <section className="min-w-0 w-full max-w-3xl rounded-2xl border border-[#c6c6cd]/70 bg-white/95 p-5 shadow-[0_18px_50px_rgba(15,23,42,0.08)] backdrop-blur sm:p-10">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-lg font-semibold text-[#0b1c30]">FinancePro</p>
            <p className="mt-1 text-xs font-semibold uppercase tracking-[0.18em] text-[#45464d]">System Status</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex max-w-full break-words rounded-full border border-[#bfdbfe] bg-[#eff6ff] px-3 py-1 text-xs font-bold uppercase text-[#1d4ed8] [overflow-wrap:anywhere]">
              {badge}
            </span>
            {code ? (
              <span className="inline-flex max-w-full break-all rounded-full border border-[#e4e4e7] bg-[#f8f9ff] px-3 py-1 text-xs font-bold uppercase text-[#45464d]">
                {code}
              </span>
            ) : null}
          </div>
        </div>

        <div className="mt-8 rounded-2xl border border-[#c6c6cd]/50 bg-[#f8f9ff] p-6 sm:p-8">
          <span className="grid size-14 place-items-center rounded-2xl bg-[#0b1c30] text-white shadow-sm">
            <Icon className="size-7" name={icon} />
          </span>
          <h1 className="mt-6 break-words text-2xl font-semibold text-[#0b1c30] sm:text-4xl">{title}</h1>
          <p className="mt-3 max-w-2xl break-words text-sm leading-7 text-[#45464d] [overflow-wrap:anywhere] sm:text-base">{description}</p>
          {details ? <div className="mt-5 min-w-0 break-words rounded-xl border border-[#c6c6cd]/50 bg-white px-4 py-3 text-sm font-medium text-[#45464d] [overflow-wrap:anywhere]">{details}</div> : null}

          {actions ? <div className="mt-8 flex min-w-0 flex-col-reverse gap-3 sm:flex-row sm:flex-wrap [&_a]:min-w-0 [&_a]:justify-center [&_button]:min-w-0 [&_button]:justify-center">{actions}</div> : null}
        </div>
      </section>
    </section>
  );
}
