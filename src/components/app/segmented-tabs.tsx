type SegmentedTabsProps = {
  tabs: string[];
  activeTab: string;
  onTabChange?: (tab: string) => void;
};

export function SegmentedTabs({ tabs, activeTab, onTabChange }: SegmentedTabsProps) {
  return (
    <div className="mb-4 flex max-w-full gap-3 overflow-x-auto border-b border-[#c6c6cd]/60 pb-px [-webkit-overflow-scrolling:touch] sm:gap-6">
      {tabs.map((tab) => (
        <button
          aria-pressed={tab === activeTab}
          className={
            tab === activeTab
              ? "inline-flex min-h-11 shrink-0 items-center border-b-2 border-[#0b1c30] px-1 text-sm font-semibold text-[#0b1c30]"
              : "inline-flex min-h-11 shrink-0 items-center border-b-2 border-transparent px-1 text-sm font-semibold text-[#45464d] transition hover:text-[#0b1c30]"
          }
          key={tab}
          onClick={() => onTabChange?.(tab)}
          type="button"
        >
          {tab}
        </button>
      ))}
    </div>
  );
}
