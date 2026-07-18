import Link from "next/link";

import { ProfileMenu } from "@/components/app/profile-menu";
import { Icon, type IconName } from "@/components/ui/icon";

type MobileHeaderAction = {
  label: string;
  icon: IconName;
  href?: string;
  title?: string;
};

type MobileHeaderProps = {
  title?: string;
  subtitle: string;
  searchLabel?: string;
  searchPlaceholder?: string;
  searchValue?: string;
  onSearchChange?: (value: string) => void;
  action?: MobileHeaderAction;
  isNavigationOpen?: boolean;
  onOpenNavigation?: () => void;
};

export function MobileHeader({
  title = "FinancePro",
  subtitle,
  action,
  isNavigationOpen = false,
  onOpenNavigation,
}: MobileHeaderProps) {
  const actionClassName = "grid size-11 shrink-0 place-items-center rounded-md bg-[#0b1c30] text-white shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2170e4]/25";

  return (
    <header className="sticky top-0 z-20 border-b border-[#c6c6cd]/70 bg-white/95 pb-4 pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] pt-[max(1rem,env(safe-area-inset-top))] backdrop-blur lg:hidden">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          {onOpenNavigation ? (
            <button
              aria-controls="mobile-navigation-panel"
              aria-expanded={isNavigationOpen}
              aria-label="Open navigation"
              className="grid size-11 shrink-0 place-items-center rounded-md border border-[#c6c6cd]/70 text-[#45464d] transition hover:bg-[#eff4ff] hover:text-[#2170e4] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2170e4]/25"
              onClick={onOpenNavigation}
              type="button"
            >
              <Icon name="menu" />
            </button>
          ) : null}
          <div className="min-w-0">
            <p className="truncate text-lg font-semibold text-[#0b1c30]">{title}</p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {action?.href ? (
            <Link aria-label={action.label} className={actionClassName} href={action.href} title={action.title ?? action.label}>
              <Icon name={action.icon} />
            </Link>
          ) : action ? (
            <button aria-label={action.label} className={actionClassName} title={action.title ?? action.label} type="button">
              <Icon name={action.icon} />
            </button>
          ) : null}
          <ProfileMenu compact />
        </div>
      </div>
      <p className="mt-3 break-words text-xs font-semibold uppercase leading-5 text-[#45464d]">{subtitle}</p>
    </header>
  );
}
