import { AppShell } from "@/components/app/app-shell";
import { PageHeader } from "@/components/app/page-header";
import { AddAssetForm } from "@/features/assets/add-asset-form";

export default function AddAssetPage() {
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
      <AddAssetForm />
    </AppShell>
  );
}
