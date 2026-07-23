import { AppShell } from "@/components/app/app-shell";
import { PageHeader } from "@/components/app/page-header";
import { AddTransactionForm, type TransactionFormInitialValues } from "@/features/transactions/add-transaction-form";
import { getAccounts } from "@/lib/accounts/supabase";
import { accountStatusContributesToCurrentTotals } from "@/lib/accounts/financial-status";
import { getAssets } from "@/lib/assets/supabase";
import { getBudgets } from "@/lib/budgets/supabase";
import { getCategories } from "@/lib/categories/supabase";
import { getDebts } from "@/lib/debts/supabase";
import { getFuturePlanningTransactionOptions } from "@/lib/future-planning/supabase";
import { getSavingsGoals } from "@/lib/savings-goals/supabase";
import { getUserSafely } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";
import { getSubscriptions } from "@/lib/subscriptions/supabase";
import type { TransactionRelatedOption } from "@/lib/transactions/supabase";

function relatedOptions(
  accounts: Awaited<ReturnType<typeof getAccounts>>,
  budgets: Awaited<ReturnType<typeof getBudgets>>,
  savingsGoals: Awaited<ReturnType<typeof getSavingsGoals>>,
  debts: Awaited<ReturnType<typeof getDebts>>,
  subscriptions: Awaited<ReturnType<typeof getSubscriptions>>,
  assets: Awaited<ReturnType<typeof getAssets>>,
): TransactionRelatedOption[] {
  return [
    { label: "No linked record", type: "none", value: "" },
    ...budgets.filter((budget) => budget.planStatus === "Active").map((budget) => ({ categoryId: budget.categoryId, label: `Budget: ${budget.category} (${budget.period})`, type: "budget" as const, value: budget.id })),
    ...savingsGoals.filter((goal) => goal.status !== "Completed").map((goal) => ({ label: `Savings Goal: ${goal.name}`, type: "savings_goal" as const, value: goal.id })),
    ...debts.filter((debt) => debt.status !== "Paid").map((debt) => ({
      creditCardDebt: debt.isCreditCardDebt ? {
        accountId: debt.creditCardAccountId,
        accountName: accounts.find((account) => account.id === debt.creditCardAccountId)?.name ?? debt.lender,
      } : undefined,
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
    ...subscriptions.filter((subscription) => subscription.status !== "Paused").map((subscription) => ({
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
    ...assets.filter((asset) => asset.status === "Active").map((asset) => ({ label: `Asset: ${asset.name}`, type: "asset" as const, value: asset.id })),
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
  const allAccounts = user ? await getAccounts(supabase, user.id) : [];
  const accounts = allAccounts.filter((account) => accountStatusContributesToCurrentTotals(account.status));
  const categories = user ? await getCategories() : [];
  const [budgets, savingsGoals, debts, subscriptions, assets, planningOptions] = user
    ? await Promise.all([
      getBudgets(supabase, user.id),
      getSavingsGoals(supabase, user.id, accounts, categories),
      getDebts(supabase, user.id, categories),
      getSubscriptions(supabase, user.id, accounts, categories),
      getAssets(supabase, user.id, categories),
      getFuturePlanningTransactionOptions(supabase, user.id),
    ])
    : [[], [], [], [], [], []];
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
      <AddTransactionForm accounts={accounts} categories={categories} initialValues={initialValues} planningOptions={planningOptions} relatedOptions={relatedOptions(accounts, budgets, savingsGoals, debts, subscriptions, assets)} />
    </AppShell>
  );
}
