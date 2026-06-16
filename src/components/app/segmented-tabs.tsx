type SegmentedTabsProps = {
  tabs: string[];
  activeTab: string;
  onTabChange?: (tab: string) => void;
};

export function SegmentedTabs({ tabs, activeTab, onTabChange }: SegmentedTabsProps) {
  return (
    <div className="mb-4 flex gap-6 overflow-x-auto border-b border-[#c6c6cd]/60">
      {tabs.map((tab) => (
        <button
          aria-pressed={tab === activeTab}
          className={
            tab === activeTab
              ? "border-b-2 border-[#0b1c30] px-1 pb-3 text-sm font-semibold text-[#0b1c30]"
              : "border-b-2 border-transparent px-1 pb-3 text-sm font-semibold text-[#45464d] transition hover:text-[#0b1c30]"
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
