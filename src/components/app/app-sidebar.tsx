"use client";

import Link from "next/link";

import { Icon } from "@/components/ui/icon";
import { navGroups, type NavItem } from "@/lib/app-navigation";

type AppSidebarProps = {
  activeLabel: string;
  collapsed?: boolean;
  groups?: NavItem[][];
  onClose?: () => void;
  onToggleCollapse?: () => void;
  variant?: "desktop" | "mobile";
};

export function AppSidebar({
  activeLabel,
  collapsed = false,
  groups = navGroups,
  onClose,
  onToggleCollapse,
  variant = "desktop",
}: AppSidebarProps) {
  const isMobile = variant === "mobile";
  const isCompact = !isMobile && collapsed;

  return (
    <aside
      className={
        isMobile
          ? "fixed inset-y-0 left-0 z-50 w-[min(19rem,calc(100vw-1rem))] border-r border-[#c6c6cd]/70 bg-white shadow-xl"
          : `${collapsed ? "w-20" : "w-64"} hidden shrink-0 border-r border-[#c6c6cd]/70 bg-white shadow-sm transition-[width] duration-200 lg:block`
      }
    >
      <div className={`${isMobile ? "px-5" : isCompact ? "px-3" : "px-6"} sticky top-0 flex h-dvh flex-col overflow-y-auto pb-6 pt-[max(1.5rem,env(safe-area-inset-top))]`}>
        <div className={isCompact ? "mb-6 flex flex-col items-center gap-3" : "mb-8 flex justify-between gap-3"}>
          <div className={isCompact ? "min-w-0 text-center" : "min-w-0"}>
            <p className="truncate text-xl font-semibold text-[#0b1c30]">{isCompact ? "FP" : "FinancePro"}</p>
            {!isCompact ? <p className="mt-1 truncate text-xs font-semibold uppercase text-[#45464d]">Wealth Management</p> : null}
          </div>
          {isMobile ? (
            <button
              aria-label="Close navigation"
              className="grid size-11 shrink-0 place-items-center rounded-full text-[#45464d] transition hover:bg-[#eff4ff] hover:text-[#2170e4] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2170e4]/25"
              onClick={onClose}
              type="button"
            >
              <Icon name="close" />
            </button>
          ) : onToggleCollapse ? (
            <button
              aria-expanded={!collapsed}
              aria-label={collapsed ? "Expand navigation" : "Collapse navigation"}
              className="grid size-11 shrink-0 place-items-center rounded-full text-[#45464d] transition hover:bg-[#eff4ff] hover:text-[#2170e4] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2170e4]/25"
              onClick={onToggleCollapse}
              title={collapsed ? "Expand navigation" : "Collapse navigation"}
              type="button"
            >
              <Icon name={collapsed ? "chevronRight" : "chevronLeft"} />
            </button>
          ) : null}
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
                  <Link
                    aria-current={isActive ? "page" : undefined}
                    className={
                      isActive
                        ? `${isCompact ? "justify-center px-0" : "gap-3 px-3"} relative flex min-h-11 items-center rounded-md bg-[#2170e4] text-sm font-semibold text-white shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2170e4]/25`
                        : `${isCompact ? "justify-center px-0" : "gap-3 px-3"} relative flex min-h-11 items-center rounded-md text-sm font-medium text-[#45464d] transition hover:bg-[#eff4ff] hover:text-[#0b1c30] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2170e4]/25`
                    }
                    href={item.href}
                    key={item.label}
                    onClick={onClose}
                    title={item.label}
                  >
                    <Icon className="size-5 shrink-0" name={item.icon} />
                    {!isCompact ? <span className="truncate">{item.label}</span> : null}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>
      </div>
    </aside>
  );
}
