import Link from "next/link";

import { Icon } from "@/components/ui/icon";
import { SearchField } from "@/components/ui/search-field";
import { ProfileMenu } from "@/components/app/profile-menu";

type AppTopBarProps = {
  onSearchChange?: (value: string) => void;
  searchValue?: string;
  searchLabel?: string;
  searchPlaceholder?: string;
};

export function AppTopBar({
  onSearchChange,
  searchValue,
  searchLabel = "Search",
  searchPlaceholder = "Search...",
}: AppTopBarProps) {
  return (
    <header className="sticky top-0 z-20 hidden h-16 items-center justify-between border-b border-[#c6c6cd]/70 bg-white/95 px-8 backdrop-blur md:flex">
      <div className="flex w-full max-w-xl items-center gap-3">
        <SearchField label={searchLabel} onChange={onSearchChange} placeholder={searchPlaceholder} value={searchValue} />
      </div>
      <div className="flex items-center gap-2">
        <Link
          aria-label="Notifications"
          className="relative grid size-10 place-items-center rounded-full text-[#45464d] transition hover:bg-[#eff4ff] hover:text-[#2170e4]"
          href="/unavailable?feature=Notifications"
          title="Notifications"
        >
          <Icon name="bell" />
          <span className="absolute right-2.5 top-2.5 size-2 rounded-full bg-[#ba1a1a]" />
        </Link>
        <Link
          aria-label="Help"
          className="grid size-10 place-items-center rounded-full text-[#45464d] transition hover:bg-[#eff4ff] hover:text-[#2170e4]"
          href="/unavailable?feature=Help"
          title="Help"
        >
          <Icon name="help" />
        </Link>
        <ProfileMenu />
      </div>
    </header>
  );
}
