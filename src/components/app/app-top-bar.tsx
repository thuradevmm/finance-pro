import { Icon } from "@/components/ui/icon";
import { SearchField } from "@/components/ui/search-field";
import { ProfileMenu } from "@/components/app/profile-menu";

type AppTopBarProps = {
  searchLabel?: string;
  searchPlaceholder?: string;
  sidebarCollapsed?: boolean;
  onToggleSidebar?: () => void;
};

export function AppTopBar({
  searchLabel = "Search",
  searchPlaceholder = "Search...",
  sidebarCollapsed = false,
  onToggleSidebar,
}: AppTopBarProps) {
  return (
    <header className="sticky top-0 z-20 hidden h-16 items-center justify-between border-b border-[#c6c6cd]/70 bg-white/95 px-8 backdrop-blur md:flex">
      <div className="flex w-full max-w-xl items-center gap-3">
        {onToggleSidebar ? (
          <button
            aria-expanded={!sidebarCollapsed}
            aria-label={sidebarCollapsed ? "Expand navigation" : "Collapse navigation"}
            className="grid size-10 shrink-0 place-items-center rounded-full text-[#45464d] transition hover:bg-[#eff4ff] hover:text-[#2170e4]"
            onClick={onToggleSidebar}
            title={sidebarCollapsed ? "Expand navigation" : "Collapse navigation"}
            type="button"
          >
            <Icon name="menu" />
          </button>
        ) : null}
        <SearchField label={searchLabel} placeholder={searchPlaceholder} />
      </div>
      <div className="flex items-center gap-2">
        <button
          aria-label="Notifications"
          className="relative grid size-10 place-items-center rounded-full text-[#45464d] transition hover:bg-[#eff4ff] hover:text-[#2170e4]"
          title="Notifications"
          type="button"
        >
          <Icon name="bell" />
          <span className="absolute right-2.5 top-2.5 size-2 rounded-full bg-[#ba1a1a]" />
        </button>
        <button
          aria-label="Help"
          className="grid size-10 place-items-center rounded-full text-[#45464d] transition hover:bg-[#eff4ff] hover:text-[#2170e4]"
          title="Help"
          type="button"
        >
          <Icon name="help" />
        </button>
        <ProfileMenu />
      </div>
    </header>
  );
}
