import { AppShell } from "@/components/app/app-shell";
import { PageHeader } from "@/components/app/page-header";
import { AddTransactionForm } from "@/features/transactions/add-transaction-form";
import { getAccounts } from "@/lib/accounts/supabase";
import { getAssets } from "@/lib/assets/supabase";
import { getBudgets } from "@/lib/budgets/supabase";
import { getCategories } from "@/lib/categories/supabase";
import { getDebts } from "@/lib/debts/supabase";
import { getSavingsGoals } from "@/lib/savings-goals/supabase";
import { getUserSafely } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";
import { getSubscriptions } from "@/lib/subscriptions/supabase";
import type { TransactionRelatedOption } from "@/lib/transactions/supabase";

function relatedOptions(
  budgets: Awaited<ReturnType<typeof getBudgets>>,
  savingsGoals: Awaited<ReturnType<typeof getSavingsGoals>>,
  debts: Awaited<ReturnType<typeof getDebts>>,
  subscriptions: Awaited<ReturnType<typeof getSubscriptions>>,
  assets: Awaited<ReturnType<typeof getAssets>>,
): TransactionRelatedOption[] {
  return [
    { label: "No linked record", type: "none", value: "" },
    ...budgets.map((budget) => ({ label: `Budget: ${budget.category} (${budget.period})`, type: "budget" as const, value: budget.id })),
    ...savingsGoals.map((goal) => ({ label: `Savings Goal: ${goal.name}`, type: "savings_goal" as const, value: goal.id })),
    ...debts.map((debt) => ({ label: `Debt: ${debt.name}`, type: "debt" as const, value: debt.id })),
    ...subscriptions.map((subscription) => ({ label: `Subscription: ${subscription.name}`, type: "subscription" as const, value: subscription.id })),
    ...assets.map((asset) => ({ label: `Asset: ${asset.name}`, type: "asset" as const, value: asset.id })),
  ];
}

export default async function AddTransactionPage() {
  const supabase = await createClient();
  const { user } = await getUserSafely(supabase);
  const accounts = user ? await getAccounts(supabase, user.id) : [];
  const categories = user ? await getCategories() : [];
  const [budgets, savingsGoals, debts, subscriptions, assets] = user
    ? await Promise.all([
      getBudgets(supabase, user.id),
      getSavingsGoals(supabase, user.id, accounts, categories),
      getDebts(supabase, user.id, categories),
      getSubscriptions(supabase, user.id, accounts, categories),
      getAssets(supabase, user.id, categories),
    ])
    : [[], [], [], [], []];

  return (
    <AppShell
      activeNavLabel="Transactions"
      mobileSearchLabel="Search transactions on mobile"
      mobileSearchPlaceholder="Search transactions..."
      mobileSubtitle="Add Transaction"
      topSearchLabel="Search transactions"
      topSearchPlaceholder="Search transactions..."
    >
      <PageHeader description="Record a new financial activity." title="Add Transaction" />
      <AddTransactionForm accounts={accounts} categories={categories} relatedOptions={relatedOptions(budgets, savingsGoals, debts, subscriptions, assets)} />
    </AppShell>
  );
}
