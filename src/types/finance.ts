import type { IconName } from "@/components/ui/icon";

export type TransactionType = "Income" | "Expense" | "Transfer";

export type TransactionCategoryName =
  | "Food"
  | "Housing"
  | "Income"
  | "Subscriptions"
  | "Transfer"
  | "Travel"
  | "Utilities";

export type Transaction = {
  id: string;
  date: string;
  type: TransactionType;
  category: TransactionCategoryName;
  account: string;
  paymentMethod: string;
  amount: string;
  note: string;
  attachment?: "receipt" | "document";
};

export type SummaryMetric = {
  label: string;
  value: string;
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
