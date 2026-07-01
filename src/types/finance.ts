import type { IconName } from "@/components/ui/icon";

export type TransactionType = "Income" | "Expense" | "Transfer";

export type TransactionCategoryName = string;

export type CategoryType = "Account" | "Asset" | "Debt" | "Expense" | "Income" | "Savings Goal" | "Subscription";

export type CategoryScope = "Transactions" | "Accounts" | "Budgets" | "Savings Goals" | "Debts" | "Subscriptions" | "Assets" | "Reports";

export type FinancialCategory = {
  id: string;
  name: string;
  type: CategoryType;
  description: string;
  monthlyAverage: string;
  transactionCount: number;
  icon: IconName;
  tone: string;
  bg: string;
  marker: string;
  scopes: CategoryScope[];
  status: "Active" | "Hidden";
};

export type BudgetPeriod = "Monthly" | "Yearly";

export type BudgetStatus = "Under Budget" | "Near Limit" | "Over Budget";

export type BudgetCategory = {
  id: string;
  category: string;
  period: BudgetPeriod;
  budget: string;
  actual: string;
  remaining: string;
  usagePercent: number;
  status: BudgetStatus;
  icon: IconName;
  tone: string;
  bg: string;
};

export type SavingsGoalStatus = "On Track" | "Behind" | "Completed";

export type SavingsGoal = {
  id: string;
  name: string;
  targetAmount: string;
  savedAmount: string;
  remainingAmount: string;
  progressPercent: number;
  targetDate: string;
  targetDateTimeValue?: string;
  monthlyContribution: string;
  account: string;
  status: SavingsGoalStatus;
  icon: IconName;
  tone: string;
  bg: string;
};

export type DebtStatus = "Active" | "Overdue" | "Paid";

export type DebtRecord = {
  id: string;
  name: string;
  lender: string;
  totalAmount: string;
  repaidAmount: string;
  remainingBalance: string;
  monthlyPayment: string;
  interestRate: string;
  nextPaymentDate: string;
  nextPaymentDateTimeValue?: string;
  progressPercent: number;
  status: DebtStatus;
  icon: IconName;
  tone: string;
  bg: string;
};

export type UpcomingDebtPayment = {
  id: string;
  debtName: string;
  dueLabel: string;
  dueDateTimeValue?: string;
  amount: string;
  isOverdue?: boolean;
};

export type SubscriptionStatus = "Active" | "Paused" | "Expiring";

export type BillingCycle = "Weekly" | "Monthly" | "Yearly";

export type SubscriptionPaymentStatus = "Due soon" | "No schedule" | "Overdue" | "Paid" | "Paused" | "Upcoming";

export type SubscriptionRecord = {
  id: string;
  name: string;
  amount: string;
  billingCycle: BillingCycle;
  billingCurrency: string;
  billedAmount: string;
  billedAmountValue: number;
  exchangeRate: number;
  exchangeRateLabel: string;
  paymentAccount: string;
  nextBillingDate: string;
  nextBillingDateTimeValue?: string;
  lastPaidAmount: string;
  lastPaidBillingDate: string;
  lastPaidBillingDateValue: string;
  lastPaidDate: string;
  lastPaidDateValue: string;
  lastPaymentTransactionId: string;
  paidCycleLabel: string;
  paymentStatus: SubscriptionPaymentStatus;
  paymentStatusDetail: string;
  status: SubscriptionStatus;
  category: string;
  reminderDaysBefore: number;
  reminderEnabled: boolean;
  reminderStatus: string;
  isPaidForCurrentPeriod: boolean;
  icon: IconName;
  tone: string;
  bg: string;
};

export type UpcomingSubscriptionBilling = {
  id: string;
  dateLabel: string;
  name: string;
  amount: string;
  billedAmount: string;
  billingCycle: BillingCycle;
  exchangeRateLabel: string;
  icon: IconName;
  isNext?: boolean;
  paymentStatus: SubscriptionPaymentStatus;
  paymentStatusDetail: string;
  reminderLabel: string;
  reminderDue: boolean;
};

export type AssetStatus = "Active" | "Sold" | "Archived";

export type AssetRecord = {
  id: string;
  name: string;
  category: string;
  purchaseDate: string;
  startUsingDate: string;
  purchaseAmount: string;
  currentValue: string;
  usageDuration: string;
  condition: "Excellent" | "Good" | "Fair" | "Needs Repair";
  status: AssetStatus;
  note: string;
  icon: IconName;
  tone: string;
  bg: string;
};

export type Transaction = {
  id: string;
  date: string;
  dateValue?: string;
  dateTimeValue?: string;
  type: TransactionType;
  category: TransactionCategoryName;
  account: string;
  accountAmountType: AccountAmountType;
  transferAccount?: string;
  transferAccountAmountType?: AccountAmountType;
  transferDirection?: "Credit" | "Debit";
  transferFromAccount?: string;
  transferGroupId?: string;
  transferToAccount?: string;
  amount: string;
  amountValue?: number;
  note: string;
  attachment?: "receipt" | "document";
  linkedAssetId?: string;
  linkedBudgetId?: string;
  linkedDebtId?: string;
  linkedSavingsGoalId?: string;
  linkedSubscriptionId?: string;
};

export type SummaryMetric = {
  label: string;
  value: string;
  icon: IconName;
  tone: string;
  bg: string;
};

export type AccountType = "Bank Account" | "Credit Card" | "Cash Wallet" | "Digital Wallet" | "Savings";

export type AccountStatus = "Active" | "Needs Review" | "Archived";
export type AccountAmountType = string;

export type AccountBalanceBreakdown = {
  type: AccountAmountType;
  amount: string;
  amountValue: number;
};

export type FinancialAccount = {
  id: string;
  name: string;
  type: AccountType;
  institution: string;
  balance: string;
  availableBalance: string;
  availableBreakdowns: AccountBalanceBreakdown[];
  accountNumber: string;
  bankBookAccountNumber: string;
  cardNumber: string;
  cardSecurityCode: string;
  cardExpiryCode: string;
  cardType: string;
  mobileBankingAccountNumber: string;
  phoneNumber: string;
  category: string;
  balanceBreakdowns: AccountBalanceBreakdown[];
  currency: string;
  lastUpdated: string;
  monthlyInflow: string;
  monthlyOutflow: string;
  transactionCount: number;
  status: AccountStatus;
  icon: IconName;
  tone: string;
  bg: string;
};

export type TransactionFilterOptions = {
  category: string[];
  account: string[];
  type: string[];
  amount: string[];
};
