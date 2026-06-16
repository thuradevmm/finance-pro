export type IconName =
  | "account"
  | "attach"
  | "bell"
  | "box"
  | "calendar"
  | "category"
  | "chart"
  | "chevronDown"
  | "chevronLeft"
  | "chevronRight"
  | "close"
  | "credit"
  | "dashboard"
  | "document"
  | "download"
  | "edit"
  | "eye"
  | "help"
  | "moreVertical"
  | "plus"
  | "receipt"
  | "savings"
  | "search"
  | "settings"
  | "subscriptions"
  | "sync"
  | "target"
  | "timeline"
  | "trash"
  | "trendingDown"
  | "trendingUp"
  | "upload"
  | "users";

const iconPaths: Record<IconName, string[]> = {
  account: [
    "M4 10h16",
    "M6 10v8",
    "M10 10v8",
    "M14 10v8",
    "M18 10v8",
    "M3 18h18",
    "M12 4 4 8h16l-8-4z",
  ],
  attach: [
    "M21 8.5 10.5 19a5 5 0 0 1-7.1-7.1l10-10a3.5 3.5 0 0 1 5 5l-10 10a2 2 0 0 1-2.8-2.8L15 4.7",
  ],
  bell: [
    "M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9",
    "M13.7 21a2 2 0 0 1-3.4 0",
  ],
  box: [
    "M21 16V8a2 2 0 0 0-1-1.7l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.7l7 4a2 2 0 0 0 2 0l7-4a2 2 0 0 0 1-1.7z",
    "M3.3 7 12 12l8.7-5",
    "M12 22V12",
  ],
  calendar: [
    "M8 2v4",
    "M16 2v4",
    "M3 10h18",
    "M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z",
  ],
  category: ["M4 4h6v6H4z", "M14 4h6v6h-6z", "M4 14h6v6H4z", "M14 14h6v6h-6z"],
  chart: ["M4 19V5", "M4 19h16", "M8 16v-5", "M12 16V8", "M16 16v-8"],
  chevronDown: ["M6 9l6 6 6-6"],
  chevronLeft: ["M15 18 9 12l6-6"],
  chevronRight: ["M9 18l6-6-6-6"],
  close: ["M18 6 6 18", "M6 6l12 12"],
  credit: [
    "M3 7h18",
    "M5 4h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z",
    "M7 15h4",
  ],
  dashboard: ["M4 13h7V4H4z", "M13 20h7V4h-7z", "M4 20h7v-5H4z"],
  document: [
    "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z",
    "M14 2v6h6",
    "M8 13h8",
    "M8 17h6",
  ],
  download: ["M12 3v12", "M7 10l5 5 5-5", "M5 21h14"],
  edit: [
    "M12 20h9",
    "M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4 11.5-11.5z",
  ],
  eye: [
    "M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z",
    "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z",
  ],
  help: [
    "M9.1 9a3 3 0 1 1 5.8 1c-.8 1.2-2.9 1.7-2.9 3.5",
    "M12 18h.01",
    "M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z",
  ],
  moreVertical: ["M12 8h.01", "M12 12h.01", "M12 16h.01"],
  plus: ["M12 5v14", "M5 12h14"],
  receipt: [
    "M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1z",
    "M9 8h6",
    "M9 12h6",
    "M9 16h4",
  ],
  savings: [
    "M6 11a7 7 0 0 1 13.7-2",
    "M6 11H4a2 2 0 0 0 0 4h2",
    "M19 9c1.3.8 2 2 2 3.5 0 3.6-3.1 6.5-7 6.5H9l-2 2v-3.5A7.2 7.2 0 0 1 4 12",
    "M10 8h.01",
    "M15 5l2-2",
  ],
  search: ["M21 21l-4.3-4.3", "M10.5 18a7.5 7.5 0 1 1 0-15 7.5 7.5 0 0 1 0 15z"],
  settings: [
    "M12 15.5A3.5 3.5 0 1 0 12 8a3.5 3.5 0 0 0 0 7.5z",
    "M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2a2 2 0 1 1-4 0V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.6-1H3a2 2 0 1 1 0-4h.2a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1A2 2 0 1 1 7.2 4l.1.1a1.7 1.7 0 0 0 1.9.3 1.7 1.7 0 0 0 1-1.6V3a2 2 0 1 1 4 0v.2a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1A2 2 0 1 1 20 7.2l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2a2 2 0 1 1 0 4h-.2a1.7 1.7 0 0 0-1.6 1z",
  ],
  subscriptions: [
    "M7 8h10",
    "M7 12h10",
    "M7 16h6",
    "M5 4h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-4l-3 3-3-3H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z",
  ],
  sync: ["M17 2l4 4-4 4", "M3 11V9a3 3 0 0 1 3-3h15", "M7 22l-4-4 4-4", "M21 13v2a3 3 0 0 1-3 3H3"],
  target: [
    "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z",
    "M12 18a6 6 0 1 0 0-12 6 6 0 0 0 0 12z",
    "M12 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4z",
  ],
  timeline: ["M4 19h16", "M6 17V9", "M12 17V5", "M18 17v-7"],
  trash: ["M3 6h18", "M8 6V4h8v2", "M6 6l1 16h10l1-16", "M10 11v6", "M14 11v6"],
  trendingDown: ["M23 18 13.5 8.5l-5 5L1 6", "M17 18h6v-6"],
  trendingUp: ["M23 6 13.5 15.5l-5-5L1 18", "M17 6h6v6"],
  upload: ["M12 15V3", "M7 8l5-5 5 5", "M5 21h14a2 2 0 0 0 2-2v-3", "M3 16v3a2 2 0 0 0 2 2"],
  users: [
    "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2",
    "M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z",
    "M22 21v-2a4 4 0 0 0-3-3.9",
    "M16 3.1a4 4 0 0 1 0 7.8",
  ],
};

export function Icon({ name, className = "size-5" }: { name: IconName; className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
      viewBox="0 0 24 24"
    >
      {iconPaths[name].map((path) => (
        <path d={path} key={path} />
      ))}
    </svg>
  );
}
