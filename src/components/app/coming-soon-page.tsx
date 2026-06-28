import { AppShell } from "@/components/app/app-shell";
import { PageHeader } from "@/components/app/page-header";
import { Icon, type IconName } from "@/components/ui/icon";

type ComingSoonPageProps = {
  activeNavLabel: string;
  description: string;
  icon: IconName;
  title: string;
};

export function ComingSoonPage({ activeNavLabel, description, icon, title }: ComingSoonPageProps) {
  return (
    <AppShell
      activeNavLabel={activeNavLabel}
      mobileSearchLabel={`Search ${title.toLowerCase()} on mobile`}
      mobileSearchPlaceholder={`Search ${title.toLowerCase()}...`}
      mobileSubtitle={title}
      topSearchLabel={`Search ${title.toLowerCase()}`}
      topSearchPlaceholder={`Search ${title.toLowerCase()}...`}
    >
      <PageHeader description={description} title={title} />

      <section className="min-w-0 rounded-lg border border-[#c6c6cd]/70 bg-white p-5 shadow-[0_4px_20px_rgba(15,23,42,0.04)] sm:p-8">
        <div className="mx-auto flex max-w-2xl flex-col items-center text-center">
          <span className="grid size-14 shrink-0 place-items-center rounded-lg bg-[#eff6ff] text-[#0058be]">
            <Icon className="size-7" name={icon} />
          </span>
          <p className="mt-5 text-xs font-bold uppercase text-[#45464d]">Coming Soon</p>
          <h2 className="mt-2 break-words text-xl font-semibold text-[#0b1c30] sm:text-2xl">{title} is not developed yet</h2>
          <p className="mt-3 text-sm leading-6 text-[#45464d]">
            This section is reserved for the next development phase. The navigation is ready, and the full workflow will be added here later.
          </p>
        </div>
      </section>
    </AppShell>
  );
}
