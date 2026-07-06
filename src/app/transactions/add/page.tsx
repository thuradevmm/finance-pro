import { AppShell } from "@/components/app/app-shell";
import { PageHeader } from "@/components/app/page-header";
import { AddTransactionForm, type TransactionFormInitialValues } from "@/features/transactions/add-transaction-form";
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
    ...debts.map((debt) => ({
      debtPayoff: debt.isCreditCardDebt ? undefined : {
        durationMonths: debt.durationMonths,
        interestRate: debt.interestRateValue,
        interestRatePeriod: debt.interestRatePeriod,
        openingRepaidAmount: debt.storedRepaidAmountValue,
        repayments: debt.repaymentActivity,
        settledAt: debt.settledAtValue,
        settledEarly: debt.status === "Paid" && Boolean(debt.settledAtValue),
        startDate: debt.startDate,
        totalAmount: debt.totalAmountValue,
      },
      label: `Debt: ${debt.name}`,
      type: "debt" as const,
      value: debt.id,
    })),
    ...subscriptions.map((subscription) => ({
      label: `Subscription: ${subscription.name}`,
      subscriptionPayment: {
        amount: subscription.amountValue,
        billedAmount: subscription.billedAmountValue,
        billingCurrency: subscription.billingCurrency,
        billingCycle: subscription.billingCycle,
        exchangeRate: subscription.exchangeRate,
        nextBillingDate: subscription.nextBillingDateValue,
      },
      type: "subscription" as const,
      value: subscription.id,
    })),
    ...assets.map((asset) => ({ label: `Asset: ${asset.name}`, type: "asset" as const, value: asset.id })),
  ];
}

function searchParamValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function AddTransactionPage({
  searchParams,
}: {
  searchParams: Promise<{ subscription?: string | string[] }>;
}) {
  const resolvedSearchParams = await searchParams;
  const requestedSubscriptionId = searchParamValue(resolvedSearchParams.subscription);
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
  const requestedSubscription = requestedSubscriptionId ? subscriptions.find((subscription) => subscription.id === requestedSubscriptionId) : undefined;
  const initialValues: TransactionFormInitialValues | undefined = requestedSubscription
    ? {
      accountId: requestedSubscription.accountId,
      amount: String(requestedSubscription.amountValue),
      date: new Date().toISOString().slice(0, 10),
      note: `Subscription payment: ${requestedSubscription.name}`,
      relatedEntityId: requestedSubscription.id,
      relatedEntityType: "subscription",
      type: "Expense",
    }
    : undefined;

  return (
    <AppShell
      activeNavLabel="Transactions"
      mobileSearchLabel="Search transactions on mobile"
      mobileSearchPlaceholder="Search transactions..."
      mobileSubtitle="Add Transaction"
      topSearchLabel="Search transactions"
      topSearchPlaceholder="Search transactions..."
    >
      <PageHeader description={requestedSubscription ? `Record payment for ${requestedSubscription.name}.` : "Record a new financial activity."} title="Add Transaction" />
      <AddTransactionForm accounts={accounts} categories={categories} initialValues={initialValues} relatedOptions={relatedOptions(budgets, savingsGoals, debts, subscriptions, assets)} />
    </AppShell>
  );
}
