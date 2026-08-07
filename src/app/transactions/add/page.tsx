import { AppShell } from "@/components/app/app-shell";
import { PageHeader } from "@/components/app/page-header";
import { AddTransactionForm, type TransactionFormInitialValues } from "@/features/transactions/add-transaction-form";
import { getAccounts } from "@/lib/accounts/supabase";
import { accountStatusContributesToCurrentTotals } from "@/lib/accounts/financial-status";
import { getAssets } from "@/lib/assets/supabase";
import { getCategories } from "@/lib/categories/supabase";
import { getCurrencySettings } from "@/lib/currency-settings";
import { getDebts } from "@/lib/debts/supabase";
import { getFuturePlanningTransactionOptions } from "@/lib/future-planning/supabase";
import { getSavingsGoals } from "@/lib/savings-goals/supabase";
import { getUserSafely } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";
import { getSubscriptions } from "@/lib/subscriptions/supabase";
import type { TransactionRelatedOption } from "@/lib/transactions/supabase";

function relatedOptions(
  accounts: Awaited<ReturnType<typeof getAccounts>>,
  savingsGoals: Awaited<ReturnType<typeof getSavingsGoals>>,
  debts: Awaited<ReturnType<typeof getDebts>>,
  subscriptions: Awaited<ReturnType<typeof getSubscriptions>>,
  assets: Awaited<ReturnType<typeof getAssets>>,
): TransactionRelatedOption[] {
  return [
    { label: "No linked record", type: "none", value: "" },
    ...savingsGoals.map((goal) => ({
      accountAmountType: goal.accountAmountType,
      accountId: goal.accountId,
      availableAmount: goal.savedAmountValue,
      categoryId: goal.categoryId,
      label: `${goal.goalType === "Fund" ? "Savings Fund" : "Savings Goal"}: ${goal.name}`,
      savingsGoalType: goal.goalType,
      type: "savings_goal" as const,
      value: goal.id,
    })),
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
      accountId: debt.paymentAccountId,
      debtRepaymentType: debt.nature === "Lending" ? "Income" as const : "Expense" as const,
      label: `${debt.isCreditCardDebt ? "Credit Card Borrowing" : debt.nature}: ${debt.name}`,
      oneTimeDebtPayoff: !debt.isCreditCardDebt && debt.repaymentFrequency === "One-time"
        ? { amount: debt.remainingBalanceValue, dueDate: debt.payoffDate || debt.nextPaymentDateValue }
        : undefined,
      type: "debt" as const,
      value: debt.id,
    })),
    ...subscriptions.filter((subscription) => subscription.status !== "Paused").map((subscription) => ({
      accountId: subscription.accountId,
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
  searchParams: Promise<{ asset?: string | string[]; savingsGoal?: string | string[]; subscription?: string | string[] }>;
}) {
  const resolvedSearchParams = await searchParams;
  const requestedSubscriptionId = searchParamValue(resolvedSearchParams.subscription);
  const requestedAssetId = searchParamValue(resolvedSearchParams.asset);
  const requestedSavingsGoalId = searchParamValue(resolvedSearchParams.savingsGoal);
  const supabase = await createClient();
  const { user } = await getUserSafely(supabase);
  const allAccounts = user ? await getAccounts(supabase, user.id) : [];
  const accounts = allAccounts.filter((account) => accountStatusContributesToCurrentTotals(account.status));
  const categories = user ? await getCategories() : [];
  const [savingsGoals, debts, subscriptions, assets, planningOptions, currencySettings] = user
    ? await Promise.all([
      getSavingsGoals(supabase, user.id, accounts, categories),
      getDebts(supabase, user.id, categories),
      getSubscriptions(supabase, user.id, accounts, categories),
      getAssets(supabase, user.id, categories),
      getFuturePlanningTransactionOptions(supabase, user.id),
      getCurrencySettings(supabase, user.id),
    ])
    : [[], [], [], [], [], { baseCurrency: "MMK", rates: [] }];
  const requestedSubscription = requestedSubscriptionId ? subscriptions.find((subscription) => subscription.id === requestedSubscriptionId) : undefined;
  const requestedAsset = !requestedSubscription && requestedAssetId ? assets.find((asset) => asset.id === requestedAssetId) : undefined;
  const requestedSavingsGoal = !requestedSubscription && !requestedAsset && requestedSavingsGoalId
    ? savingsGoals.find((goal) => goal.id === requestedSavingsGoalId)
    : undefined;
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
    : requestedAsset
      ? {
        date: requestedAsset.purchaseDateValue || new Date().toISOString().slice(0, 10),
        note: `Asset purchase: ${requestedAsset.name}`,
        relatedEntityId: requestedAsset.id,
        relatedEntityType: "asset",
        type: "Expense",
      }
      : requestedSavingsGoal
        ? {
          accountId: accounts.find((account) => account.id !== requestedSavingsGoal.accountId && account.type !== "Credit Card")?.id
            ?? requestedSavingsGoal.accountId,
          date: new Date().toISOString().slice(0, 10),
          note: `Savings transfer: ${requestedSavingsGoal.name}`,
          relatedEntityId: requestedSavingsGoal.id,
          relatedEntityType: "savings_goal",
          transferAccountAmountType: requestedSavingsGoal.accountAmountType,
          transferAccountId: requestedSavingsGoal.accountId,
          type: "Transfer",
        }
        : undefined;
  const pageDescription = requestedSubscription
    ? `Record the actual amount paid for ${requestedSubscription.name}; the exchange rate will be calculated automatically.`
    : requestedAsset
      ? `Record the amount paid for ${requestedAsset.name}; the asset value will update automatically.`
      : requestedSavingsGoal
        ? `Move capital into ${requestedSavingsGoal.name}; its savings account and goal-owned amount type are selected automatically.`
        : "Record a new financial activity.";

  return (
    <AppShell
      activeNavLabel="Transactions"
      mobileSearchLabel="Search transactions on mobile"
      mobileSearchPlaceholder="Search transactions..."
      mobileSubtitle="Add Transaction"
      topSearchLabel="Search transactions"
      topSearchPlaceholder="Search transactions..."
    >
      <PageHeader description={pageDescription} title="Add Transaction" />
      <AddTransactionForm accounts={accounts} categories={categories} currencySettings={currencySettings} initialValues={initialValues} planningOptions={planningOptions} relatedOptions={relatedOptions(accounts, savingsGoals, debts, subscriptions, assets)} />
    </AppShell>
  );
}
