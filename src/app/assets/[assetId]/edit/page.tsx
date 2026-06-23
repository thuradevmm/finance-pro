import { notFound } from "next/navigation";

import { AppShell } from "@/components/app/app-shell";
import { PageHeader } from "@/components/app/page-header";
import { AddAssetForm } from "@/features/assets/add-asset-form";
import { getAsset } from "@/lib/assets/supabase";
import { getCategories } from "@/lib/categories/supabase";
import { getUserSafely } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";

export default async function EditAssetPage({ params }: { params: Promise<{ assetId: string }> }) {
  const { assetId } = await params;
  const supabase = await createClient();
  const { user } = await getUserSafely(supabase);
  if (!user) notFound();
  const categories = await getCategories();
  const asset = await getAsset(supabase, user.id, assetId, categories);

  if (!asset) {
    notFound();
  }

  return (
    <AppShell activeNavLabel="Assets" mobileSearchLabel="Search assets on mobile" mobileSearchPlaceholder="Search assets..." mobileSubtitle="Edit Asset" topSearchLabel="Search assets" topSearchPlaceholder="Search assets...">
      <PageHeader description={`Update asset details for ${asset.name}.`} title="Edit Asset" />
      <AddAssetForm asset={asset} categories={categories} />
    </AppShell>
  );
}
