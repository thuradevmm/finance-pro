import { Icon } from "@/components/ui/icon";
import { navGroups, type NavItem } from "@/lib/app-navigation";

type AppSidebarProps = {
  activeLabel: string;
  groups?: NavItem[][];
};

export function AppSidebar({ activeLabel, groups = navGroups }: AppSidebarProps) {
  return (
    <aside className="hidden w-64 shrink-0 border-r border-[#c6c6cd]/70 bg-white shadow-sm md:block">
      <div className="sticky top-0 flex h-screen flex-col overflow-y-auto px-6 py-6">
        <div className="mb-8">
          <p className="text-xl font-semibold text-[#0b1c30]">FinancePro</p>
          <p className="mt-1 text-xs font-semibold uppercase text-[#45464d]">Wealth Management</p>
        </div>

        <nav aria-label="Main navigation" className="flex flex-1 flex-col gap-4">
          {groups.map((group, groupIndex) => (
            <div
              className={groupIndex === 0 ? "flex flex-col gap-1" : "flex flex-col gap-1 border-t border-[#c6c6cd]/40 pt-4"}
              key={groupIndex}
            >
              {group.map((item) => {
                const isActive = item.label === activeLabel;

                return (
                  <a
                    aria-current={isActive ? "page" : undefined}
                    className={
                      isActive
                        ? "flex h-10 items-center gap-3 rounded-md bg-[#2170e4] px-3 text-sm font-semibold text-white shadow-sm"
                        : "flex h-10 items-center gap-3 rounded-md px-3 text-sm font-medium text-[#45464d] transition hover:bg-[#eff4ff] hover:text-[#0b1c30]"
                    }
                    href={item.href}
                    key={item.label}
                  >
                    <Icon className="size-5 shrink-0" name={item.icon} />
                    <span className="truncate">{item.label}</span>
                  </a>
                );
              })}
            </div>
          ))}
        </nav>
      </div>
    </aside>
  );
}
