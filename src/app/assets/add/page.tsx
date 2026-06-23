import { AppShell } from "@/components/app/app-shell";
import { PageHeader } from "@/components/app/page-header";
import { AddAssetForm } from "@/features/assets/add-asset-form";
import { getCategories } from "@/lib/categories/supabase";
import { getUserSafely } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";

export default async function AddAssetPage() {
  const supabase = await createClient();
  const { user } = await getUserSafely(supabase);
  const categories = user ? await getCategories() : [];

  return (
    <AppShell
      activeNavLabel="Assets"
      mobileSearchLabel="Search assets on mobile"
      mobileSearchPlaceholder="Search assets..."
      mobileSubtitle="Add Asset"
      topSearchLabel="Search assets"
      topSearchPlaceholder="Search assets..."
    >
      <PageHeader description="Record a personal asset, purchase details, current value, and usage notes." title="Add Asset" />
      <AddAssetForm categories={categories} />
    </AppShell>
  );
}
