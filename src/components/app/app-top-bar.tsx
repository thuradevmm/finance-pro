import Link from "next/link";

import { Icon } from "@/components/ui/icon";
import { ProfileMenu } from "@/components/app/profile-menu";

export function AppTopBar() {
  return (
    <header className="sticky top-0 z-20 hidden h-16 items-center justify-between border-b border-[#c6c6cd]/70 bg-white/95 pl-8 pr-[max(2rem,env(safe-area-inset-right))] backdrop-blur lg:flex">
      <div className="min-w-0" />
      <div className="flex items-center gap-2">
        <Link
          aria-label="Notifications"
          className="relative grid size-11 place-items-center rounded-full text-[#45464d] transition hover:bg-[#eff4ff] hover:text-[#2170e4] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2170e4]/25"
          href="/unavailable?feature=Notifications"
          title="Notifications"
        >
          <Icon name="bell" />
          <span aria-hidden="true" className="absolute right-3 top-3 size-2 rounded-full bg-[#ba1a1a]" />
        </Link>
        <Link
          aria-label="Help"
          className="grid size-11 place-items-center rounded-full text-[#45464d] transition hover:bg-[#eff4ff] hover:text-[#2170e4] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2170e4]/25"
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
