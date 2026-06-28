import Link from "next/link";

import { AppShell } from "@/components/app/app-shell";
import { PageHeader } from "@/components/app/page-header";
import { SummaryCards } from "@/components/app/summary-cards";
import { Icon } from "@/components/ui/icon";
import { AssetsPageContent } from "@/features/assets/assets-page-content";
import { getAssetSummaries, getAssets } from "@/lib/assets/supabase";
import { getCategories } from "@/lib/categories/supabase";
import { getUserSafely } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";

export default async function AssetsPage() {
  const supabase = await createClient();
  const { user } = await getUserSafely(supabase);
  const categories = user ? await getCategories({ limit: 200 }) : [];
  const assets = user ? await getAssets(supabase, user.id, categories, { limit: 200 }) : [];
  const summaries = getAssetSummaries(assets);

  return (
    <AppShell
      activeNavLabel="Assets"
      mobileAction={{ label: "Add asset", icon: "plus", href: "/assets/add", title: "Add asset" }}
      mobileSearchLabel="Search assets on mobile"
      mobileSearchPlaceholder="Search assets..."
      mobileSubtitle="Assets"
      topSearchLabel="Search assets"
      topSearchPlaceholder="Search assets..."
    >
      <PageHeader
        actions={
          <Link
            className="inline-flex min-h-11 items-center gap-2 rounded-md bg-[#0b1c30] px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-[#1f2937]"
            href="/assets/add"
          >
            <Icon className="size-4" name="plus" />
            Add Asset
          </Link>
        }
        description="Track personal purchases, asset value, condition, and usage duration."
        title="Assets"
      />

      <SummaryCards summaries={summaries} />
      <AssetsPageContent assets={assets} />
    </AppShell>
  );
}
