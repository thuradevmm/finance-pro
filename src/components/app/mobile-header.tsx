import Link from "next/link";

import { ProfileMenu } from "@/components/app/profile-menu";
import { Icon, type IconName } from "@/components/ui/icon";
import { SearchField } from "@/components/ui/search-field";

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
  action?: MobileHeaderAction;
  onOpenNavigation?: () => void;
};

export function MobileHeader({
  title = "FinancePro",
  subtitle,
  searchLabel = "Search on mobile",
  searchPlaceholder = "Search...",
  action,
  onOpenNavigation,
}: MobileHeaderProps) {
  const actionClassName = "grid size-10 place-items-center rounded-md bg-[#0b1c30] text-white shadow-sm";

  return (
    <header className="sticky top-0 z-20 border-b border-[#c6c6cd]/70 bg-white/95 px-4 py-4 backdrop-blur md:hidden">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          {onOpenNavigation ? (
            <button
              aria-label="Open navigation"
              className="grid size-10 shrink-0 place-items-center rounded-md border border-[#c6c6cd]/70 text-[#45464d] transition hover:bg-[#eff4ff] hover:text-[#2170e4]"
              onClick={onOpenNavigation}
              type="button"
            >
              <Icon name="menu" />
            </button>
          ) : null}
          <div className="min-w-0">
            <p className="truncate text-lg font-semibold text-[#0b1c30]">{title}</p>
            <p className="truncate text-xs font-semibold uppercase text-[#45464d]">{subtitle}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
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
      <div className="mt-4">
        <SearchField label={searchLabel} placeholder={searchPlaceholder} />
      </div>
    </header>
  );
}
