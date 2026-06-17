import { AppShell } from "@/components/app/app-shell";
import { PageHeader } from "@/components/app/page-header";
import { SimpleRecordEditPage } from "@/components/ui/simple-record-edit-page";
import { assets } from "@/lib/assets/mock-data";
import type { AssetRecord, AssetStatus } from "@/types/finance";

const conditions: AssetRecord["condition"][] = ["Excellent", "Good", "Fair", "Needs Repair"];
const statuses: AssetStatus[] = ["Active", "Sold", "Archived"];

export default async function EditAssetPage({ params }: { params: Promise<{ assetId: string }> }) {
  const { assetId } = await params;
  const asset = assets.find((item) => item.id === assetId) ?? assets[0];

  return (
    <AppShell activeNavLabel="Assets" mobileSearchLabel="Search assets on mobile" mobileSearchPlaceholder="Search assets..." mobileSubtitle="Edit Asset" topSearchLabel="Search assets" topSearchPlaceholder="Search assets...">
      <PageHeader description={`Update asset details for ${asset.name}.`} title="Edit Asset" />
      <SimpleRecordEditPage
        cancelHref="/assets"
        fields={[
          { key: "name", label: "Asset Name" },
          { key: "category", label: "Category" },
          { key: "purchaseDate", label: "Purchase Date", type: "date" },
          { key: "startUsingDate", label: "Start Using Date", type: "date" },
          { key: "purchaseAmount", label: "Purchase Amount", type: "currency" },
          { key: "currentValue", label: "Current Value", type: "currency" },
          { key: "condition", label: "Condition", options: conditions },
          { key: "status", label: "Status", options: statuses },
          { key: "note", label: "Description", type: "textarea" },
        ]}
        preview={{
          icon: asset.icon,
          iconClassName: `${asset.bg} ${asset.tone}`,
          label: "Asset Preview",
          metrics: [
            { label: "Purchase", key: "purchaseAmount" },
            { label: "Current", key: "currentValue" },
            { label: "Started", key: "startUsingDate" },
            { label: "Used", key: "startUsingDate", format: "usageDurationFromDate" },
            { label: "Condition", key: "condition" },
          ],
          primaryKey: "name",
          secondaryKey: "category",
        }}
        record={asset as unknown as Record<string, string>}
        saveLabel="Save Asset"
      />
    </AppShell>
  );
}
