import Link from "next/link";

import { StatusPage } from "@/components/app/status-page";

export default function SettingsPage() {
  return (
    <StatusPage
      actions={<Link className="inline-flex min-h-11 items-center justify-center rounded-md bg-[#0b1c30] px-4 text-sm font-semibold text-white" href="/dashboard">Back to dashboard</Link>}
      badge="Temporarily closed"
      description="Settings are temporarily unavailable while system preferences are being reorganized. Your saved currency and profile values remain unchanged."
      icon="settings"
      title="Settings are temporarily closed"
    />
  );
}
