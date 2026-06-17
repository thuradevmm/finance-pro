"use client";

import { useState } from "react";

import { Icon } from "@/components/ui/icon";
import { ProgressCircle } from "@/components/ui/progress-circle";
import { RecordActions } from "@/components/ui/record-actions";
import type { SavingsGoal, SavingsGoalStatus } from "@/types/finance";

const statusStyles: Record<SavingsGoalStatus, string> = {
  "On Track": "bg-[#ecfdf5] text-[#166534]",
  Behind: "bg-[#fffbeb] text-[#92400e]",
  Completed: "bg-[#eff6ff] text-[#0058be]",
};

function SavingsGoalCard({ goal, onDelete }: { goal: SavingsGoal; onDelete: (id: string) => void }) {
  return (
    <article className="flex flex-col rounded-lg border border-[#c6c6cd]/60 bg-white p-5 shadow-[0_4px_20px_rgba(15,23,42,0.04)]">
      <div className="mb-5 flex items-center justify-between gap-4 border-b border-[#c6c6cd]/40 pb-4">
        <div className="flex min-w-0 items-center gap-3">
          <span className={`grid size-10 shrink-0 place-items-center rounded-lg ${goal.bg} ${goal.tone}`}>
            <Icon className="size-5" name={goal.icon} />
          </span>
          <div className="min-w-0">
            <h2 className="truncate text-xl font-semibold text-[#0b1c30]">{goal.name}</h2>
            <p className="mt-1 text-xs font-semibold text-[#45464d]">{goal.account}</p>
          </div>
        </div>
        <span className={`shrink-0 rounded px-2 py-1 text-xs font-bold uppercase ${statusStyles[goal.status]}`}>{goal.status}</span>
      </div>

      <ProgressCircle percent={goal.progressPercent} tone={goal.tone} />

      <dl className="mt-5 grid grid-cols-2 gap-3 text-center">
        <div>
          <dt className="mb-1 text-xs font-bold uppercase text-[#45464d]">Saved</dt>
          <dd className="text-lg font-semibold text-[#0b1c30]">{goal.savedAmount}</dd>
        </div>
        <div>
          <dt className="mb-1 text-xs font-bold uppercase text-[#45464d]">Target</dt>
          <dd className="text-lg font-semibold text-[#0b1c30]">{goal.targetAmount}</dd>
        </div>
      </dl>

      <div className="mt-5 border-t border-[#c6c6cd]/40 pt-4">
        <div className="flex items-center justify-center gap-2 text-sm font-medium text-[#45464d]">
          <Icon className="size-4" name="calendar" />
          Target: {goal.targetDate}
        </div>
        <div className="mt-4 flex items-center justify-end gap-1">
          <RecordActions editHref={`/savings-goals/${goal.id}/edit`} itemId={goal.id} itemLabel={goal.name} onDelete={onDelete} />
        </div>
      </div>
    </article>
  );
}

export function SavingsGoalsGrid({ goals }: { goals: SavingsGoal[] }) {
  const [visibleGoals, setVisibleGoals] = useState(goals);

  return (
    <section className="grid grid-cols-1 gap-6 lg:grid-cols-2 xl:grid-cols-3">
      {visibleGoals.map((goal) => (
        <SavingsGoalCard goal={goal} key={goal.id} onDelete={(id) => setVisibleGoals((items) => items.filter((item) => item.id !== id))} />
      ))}
    </section>
  );
}
