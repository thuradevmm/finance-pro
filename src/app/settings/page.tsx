import { AppShell } from "@/components/app/app-shell";
import { PageHeader } from "@/components/app/page-header";
import { CurrencySettingsForm } from "@/features/settings/currency-settings-form";
import { getCurrencySettings } from "@/lib/currency-settings";
import { getUserSafely } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";

export default async function SettingsPage() {
  const supabase = await createClient();
  const { user } = await getUserSafely(supabase);
  const settings = user ? await getCurrencySettings(supabase, user.id) : { baseCurrency: "MMK", rates: [] };
  return (
    <AppShell activeNavLabel="Settings" mobileSubtitle="Settings">
      <PageHeader description="Manage the base currency and dated exchange rates used by account totals, dashboards, reports, and exports." title="Settings" />
      <CurrencySettingsForm settings={settings} />
    </AppShell>
  );
}
