import { notFound } from "next/navigation";

import { AppShell } from "@/components/app/app-shell";
import { PageHeader } from "@/components/app/page-header";
import { AddTransactionForm } from "@/features/transactions/add-transaction-form";
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
import { getTransaction, type TransactionRecord, type TransactionRelatedOption } from "@/lib/transactions/supabase";

function relatedOptions(
  accounts: Awaited<ReturnType<typeof getAccounts>>,
  budgets: Awaited<ReturnType<typeof getBudgets>>,
  savingsGoals: Awaited<ReturnType<typeof getSavingsGoals>>,
  debts: Awaited<ReturnType<typeof getDebts>>,
  subscriptions: Awaited<ReturnType<typeof getSubscriptions>>,
  assets: Awaited<ReturnType<typeof getAssets>>,
  transaction?: TransactionRecord,
): TransactionRelatedOption[] {
  const preserves = (type: TransactionRelatedOption["type"], id: string) => transaction?.relatedEntityType === type && transaction.relatedEntityId === id;
  return [
    { label: "No linked record", type: "none", value: "" },
    ...budgets.filter((budget) => budget.planStatus === "Active" || preserves("budget", budget.id)).map((budget) => ({ categoryId: budget.categoryId, label: `Budget: ${budget.category} (${budget.period})`, type: "budget" as const, value: budget.id })),
    ...savingsGoals.filter((goal) => goal.status !== "Completed" || preserves("savings_goal", goal.id)).map((goal) => ({ label: `Savings Goal: ${goal.name}`, type: "savings_goal" as const, value: goal.id })),
    ...debts.filter((debt) => debt.status !== "Paid" || preserves("debt", debt.id)).map((debt) => ({
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
    ...subscriptions.filter((subscription) => subscription.status !== "Paused" || preserves("subscription", subscription.id)).map((subscription) => ({
      label: `Subscription: ${subscription.name}`,
      subscriptionPayment: {
        amount: transaction?.relatedEntityType === "subscription" && transaction.relatedEntityId === subscription.id
          ? transaction.amountValue
          : subscription.amountValue,
        billedAmount: transaction?.relatedEntityType === "subscription" && transaction.relatedEntityId === subscription.id
          ? transaction.subscriptionPayment?.billedAmount || subscription.billedAmountValue
          : subscription.billedAmountValue,
        billingCurrency: transaction?.relatedEntityType === "subscription" && transaction.relatedEntityId === subscription.id
          ? transaction.subscriptionPayment?.billingCurrency || subscription.billingCurrency
          : subscription.billingCurrency,
        billingCycle: subscription.billingCycle,
        exchangeRate: transaction?.relatedEntityType === "subscription" && transaction.relatedEntityId === subscription.id
          ? transaction.subscriptionPayment?.exchangeRate || subscription.exchangeRate
          : subscription.exchangeRate,
        nextBillingDate: transaction?.relatedEntityType === "subscription" && transaction.relatedEntityId === subscription.id
          ? transaction.subscriptionPayment?.billingDueDate || subscription.nextBillingDateValue
          : subscription.nextBillingDateValue,
      },
      type: "subscription" as const,
      value: subscription.id,
    })),
    ...assets.filter((asset) => asset.status === "Active" || preserves("asset", asset.id)).map((asset) => ({ label: `Asset: ${asset.name}`, type: "asset" as const, value: asset.id })),
  ];
}

export default async function EditTransactionPage({ params }: PageProps<"/transactions/[transactionId]/edit">) {
  const { transactionId } = await params;
  const supabase = await createClient();
  const { user } = await getUserSafely(supabase);
  if (!user) notFound();
  const allAccounts = await getAccounts(supabase, user.id);
  const categories = await getCategories();
  const transaction = await getTransaction(supabase, user.id, transactionId, allAccounts, categories);
  if (!transaction) notFound();
  const [budgets, savingsGoals, debts, subscriptions, assets, planningOptions] = await Promise.all([
    getBudgets(supabase, user.id),
      getSavingsGoals(supabase, user.id, allAccounts, categories),
    getDebts(supabase, user.id, categories),
      getSubscriptions(supabase, user.id, allAccounts, categories),
    getAssets(supabase, user.id, categories),
    getFuturePlanningTransactionOptions(supabase, user.id, transaction.futurePlanningAmountId),
  ]);
  const preservedAccountIds = new Set([
    transaction.accountId,
    transaction.transferAccountId,
    transaction.transferFromAccountId,
    transaction.transferToAccountId,
  ].filter(Boolean));
  const accounts = allAccounts.filter((account) => accountStatusContributesToCurrentTotals(account.status) || preservedAccountIds.has(account.id));

  return (
    <AppShell
      activeNavLabel="Transactions"
      mobileSearchLabel="Search transactions on mobile"
      mobileSearchPlaceholder="Search transactions..."
      mobileSubtitle="Edit Transaction"
      topSearchLabel="Search transactions"
      topSearchPlaceholder="Search transactions..."
    >
      <PageHeader description="Update transaction details and linked financial impacts." title="Edit Transaction" />
      <AddTransactionForm accounts={accounts} categories={categories} planningOptions={planningOptions} relatedOptions={relatedOptions(accounts, budgets, savingsGoals, debts, subscriptions, assets, transaction)} transaction={transaction} />
    </AppShell>
  );
}
