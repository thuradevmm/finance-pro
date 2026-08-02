import Link from "next/link";

import { AppShell } from "@/components/app/app-shell";
import { PageHeader } from "@/components/app/page-header";
import { Icon } from "@/components/ui/icon";
import { getNotifications } from "@/lib/notifications/supabase";
import { getUserSafely } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";

const severityStyles = {
  urgent: "border-[#fecaca] bg-[#fff1f0] text-[#991b1b]",
  attention: "border-[#fde68a] bg-[#fffbeb] text-[#92400e]",
  info: "border-[#bfdbfe] bg-[#eff6ff] text-[#0058be]",
} as const;

function localDateValue(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export default async function NotificationsPage() {
  const supabase = await createClient();
  const { user } = await getUserSafely(supabase);
  const notifications = user ? await getNotifications(supabase, user.id, localDateValue(new Date())) : [];
  const urgentCount = notifications.filter((notification) => notification.severity === "urgent").length;

  return (
    <AppShell activeNavLabel="" mobileSubtitle="Notifications">
      <PageHeader description="Reminders and control alerts from subscriptions, borrowing and lending, savings goals, future plans, and assets." title="Notifications" />
      <div className="mb-5 flex flex-wrap gap-2 text-xs font-bold uppercase">
        <span className="rounded-full bg-[#0b1c30] px-3 py-1.5 text-white">{notifications.length} active</span>
        {urgentCount > 0 ? <span className="rounded-full bg-[#fff1f0] px-3 py-1.5 text-[#991b1b]">{urgentCount} urgent</span> : null}
      </div>
      {notifications.length > 0 ? (
        <section className="space-y-3" aria-label="Active notifications">
          {notifications.map((notification) => (
            <Link className="flex min-w-0 flex-col gap-4 rounded-lg border border-[#c6c6cd]/70 bg-white p-4 shadow-sm transition hover:border-[#2170e4]/50 hover:bg-[#f8f9ff] sm:flex-row sm:items-center sm:justify-between" href={notification.href} key={notification.id}>
              <div className="flex min-w-0 items-start gap-3">
                <span className={`grid size-10 shrink-0 place-items-center rounded-lg border ${severityStyles[notification.severity]}`}><Icon className="size-5" name="bell" /></span>
                <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h2 className="break-words font-semibold text-[#0b1c30]">{notification.title}</h2><span className={`rounded px-2 py-1 text-[10px] font-bold uppercase ${severityStyles[notification.severity]}`}>{notification.severity}</span></div><p className="mt-1 break-words text-sm leading-6 text-[#45464d]">{notification.detail}</p><p className="mt-1 text-xs font-bold uppercase text-[#76777d]">{notification.source}</p></div>
              </div>
              <span className="inline-flex min-h-11 shrink-0 items-center gap-2 self-start rounded-md px-3 text-sm font-semibold text-[#0058be] sm:self-center">Review <Icon className="size-4" name="chevronRight" /></span>
            </Link>
          ))}
        </section>
      ) : (
        <section className="rounded-lg border border-dashed border-[#c6c6cd] bg-white px-5 py-12 text-center"><span className="mx-auto grid size-12 place-items-center rounded-full bg-[#ecfdf5] text-[#047857]"><Icon name="check" /></span><h2 className="mt-4 text-lg font-semibold text-[#0b1c30]">You are all caught up</h2><p className="mt-1 text-sm text-[#45464d]">There are no due reminders or financial controls needing attention.</p></section>
      )}
    </AppShell>
  );
}
