import Link from "next/link";
import type { ReactNode } from "react";

import { Icon } from "@/components/ui/icon";

type AuthShellProps = {
  children: ReactNode;
  description: string;
  eyebrow: string;
  title: string;
};

const highlights = [
  "Accounts and cash flow in one workspace",
  "Budgets, goals, and debts kept connected",
  "Private financial records with clear controls",
];

export function AuthShell({ children, description, eyebrow, title }: AuthShellProps) {
  return (
    <main className="grid min-h-screen bg-white lg:grid-cols-[minmax(0,1.05fr)_minmax(440px,0.95fr)]">
      <section className="relative hidden overflow-hidden bg-[#0b1c30] px-12 py-10 text-white lg:flex lg:flex-col lg:justify-between xl:px-16">
        <Link className="inline-flex w-fit items-center gap-3" href="/login">
          <span className="grid size-10 place-items-center rounded-lg bg-[#2170e4] text-lg font-bold">F</span>
          <span>
            <span className="block text-xl font-semibold">FinancePro</span>
            <span className="block text-xs font-semibold uppercase text-[#a9b9cc]">Wealth Management</span>
          </span>
        </Link>

        <div className="max-w-xl pb-12">
          <p className="text-sm font-bold uppercase text-[#4edea3]">Personal finance, organized</p>
          <h2 className="mt-5 text-4xl font-semibold leading-tight xl:text-5xl">A clear view of every financial decision.</h2>
          <p className="mt-5 max-w-lg text-base leading-7 text-[#c9d5e3]">
            Track daily activity and long-term plans from one focused workspace built around your financial records.
          </p>
          <ul className="mt-10 space-y-4">
            {highlights.map((highlight) => (
              <li className="flex items-center gap-3 text-sm font-medium text-[#e7edf4]" key={highlight}>
                <span className="grid size-7 shrink-0 place-items-center rounded-full bg-[#4edea3]/15 text-[#4edea3]">
                  <Icon className="size-4" name="trendingUp" />
                </span>
                {highlight}
              </li>
            ))}
          </ul>
        </div>

        <p className="text-xs text-[#8fa2b8]">Secure personal finance workspace</p>
      </section>

      <section className="flex min-h-screen items-center justify-center bg-[#f8f9ff] px-4 py-8 sm:px-8 lg:px-12">
        <div className="w-full max-w-md">
          <Link className="mb-10 inline-flex items-center gap-3 lg:hidden" href="/login">
            <span className="grid size-10 place-items-center rounded-lg bg-[#0b1c30] text-lg font-bold text-white">F</span>
            <span className="text-xl font-semibold text-[#0b1c30]">FinancePro</span>
          </Link>

          <div className="rounded-lg border border-[#c6c6cd]/60 bg-white p-6 shadow-[0_14px_40px_rgba(15,23,42,0.08)] sm:p-8">
            <p className="text-xs font-bold uppercase text-[#2170e4]">{eyebrow}</p>
            <h1 className="mt-3 text-3xl font-semibold text-[#0b1c30]">{title}</h1>
            <p className="mt-3 text-sm leading-6 text-[#5f6168]">{description}</p>
            <div className="mt-8">{children}</div>
          </div>

          <p className="mt-6 text-center text-xs leading-5 text-[#76777d]">Protected by Supabase Auth and row-level security.</p>
        </div>
      </section>
    </main>
  );
}
