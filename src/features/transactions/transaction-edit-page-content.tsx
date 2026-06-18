"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { StatusPage } from "@/components/app/status-page";
import { EditRecordPage } from "@/components/ui/edit-record-page";
import { Icon } from "@/components/ui/icon";
import { formatSignedAmount } from "@/features/transactions/transaction-amount";
import { TransactionEditForm } from "@/features/transactions/transaction-edit-form";
import { amountClass, transactionTypeIcon } from "@/features/transactions/transaction-styles";
import { getImpactTarget, getImpactValue, transactionImpactOptions } from "@/lib/transactions/impact-options";
import { transactions as fallbackTransactions } from "@/lib/transactions/mock-data";
import { updateTransactionInStorage, useStoredTransactions } from "@/lib/transactions/transaction-store";
import type { Transaction, TransactionFilterOptions } from "@/types/finance";

type TransactionEditPageContentProps = {
  filterOptions: TransactionFilterOptions;
  transactionId: string;
};

export function TransactionEditPageContent({ filterOptions, transactionId }: TransactionEditPageContentProps) {
  const router = useRouter();
  const storedTransactions = useStoredTransactions(fallbackTransactions);
  const transaction = storedTransactions.find((item) => item.id === transactionId) ?? null;
  const [overrides, setOverrides] = useState<Partial<Transaction>>({});
  const draft = transaction ? { ...transaction, ...overrides } : null;

  function updateDraft<Key extends keyof Transaction>(key: Key, value: Transaction[Key]) {
    setOverrides((currentOverrides) => ({ ...currentOverrides, [key]: value }));
  }

  function saveTransaction() {
    if (!draft) {
      return;
    }

    updateTransactionInStorage(draft, fallbackTransactions);
    router.push("/transactions");
  }

  if (!draft) {
    return (
      <StatusPage
        actions={
          <>
            <Link
              className="inline-flex h-11 items-center justify-center rounded-lg border border-[#c6c6cd]/70 bg-white px-5 text-sm font-semibold text-[#45464d] transition hover:bg-[#eff4ff]"
              href="/"
            >
              Return Home
            </Link>
            <Link
              className="inline-flex h-11 items-center gap-2 rounded-lg bg-[#0b1c30] px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#1f2937]"
              href="/transactions"
            >
              <Icon className="size-4" name="receipt" />
              Back to Transactions
            </Link>
          </>
        }
        badge="Not Found"
        code="404"
        description="This transaction could not be found in the current dataset. It may have been deleted, or the browser no longer has the locally stored record."
        fullHeight={false}
        icon="search"
        title="Transaction record not found"
      />
    );
  }

  const impactTarget = getImpactTarget(draft);
  const impactValue = getImpactValue(draft, impactTarget);
  const impactRecord = transactionImpactOptions[impactTarget].find((option) => option.value === impactValue);
  const impactLabel = impactTarget === "None" ? "No linked page" : `${impactTarget}: ${impactRecord?.label ?? "Select record"}`;

  return (
    <EditRecordPage
      cancelHref="/transactions"
      onSave={saveTransaction}
      preview={
        <div className="sticky top-24 rounded-lg border border-[#c6c6cd]/60 bg-[#eff4ff] p-6 text-center shadow-[0_4px_20px_rgba(15,23,42,0.04)]">
          <div className="mx-auto mb-5 grid size-20 place-items-center rounded-full bg-white text-[#0058be] shadow-sm">
            <Icon className="size-10" name={transactionTypeIcon(draft.type)} />
          </div>
          <p className="text-xs font-bold uppercase text-[#45464d]">{draft.type} Preview</p>
          <h3 className={`mt-2 text-5xl font-bold ${amountClass(draft.type)}`}>{formatSignedAmount(draft.amount, draft.type)}</h3>

          <div className="mt-6 space-y-4 rounded-lg border border-[#c6c6cd]/40 bg-white p-4 text-left">
            <div className="flex items-center justify-between gap-4">
              <span className="text-xs font-bold uppercase text-[#45464d]">Date</span>
              <span className="text-sm font-semibold text-[#0b1c30]">{draft.date || "-"}</span>
            </div>
            <div className="flex items-center justify-between gap-4">
              <span className="text-xs font-bold uppercase text-[#45464d]">Account</span>
              <span className="text-right text-sm font-semibold text-[#0b1c30]">{draft.account || "-"}</span>
            </div>
            <div className="flex items-center justify-between gap-4">
              <span className="text-xs font-bold uppercase text-[#45464d]">Category</span>
              <span className="text-sm font-semibold text-[#0b1c30]">{draft.category || "-"}</span>
            </div>
            <div className="flex items-center justify-between gap-4">
              <span className="text-xs font-bold uppercase text-[#45464d]">Reflects To</span>
              <span className="text-right text-sm font-semibold text-[#0b1c30]">{impactLabel}</span>
            </div>
            <div className="border-t border-[#c6c6cd]/40 pt-4">
              <span className="text-xs font-bold uppercase text-[#45464d]">Note</span>
              <p className="mt-1 line-clamp-3 text-sm font-semibold text-[#0b1c30]">{draft.note.trim() || "Add transaction note"}</p>
            </div>
          </div>
        </div>
      }
      saveLabel="Save Transaction"
    >
      <TransactionEditForm draft={draft} filterOptions={filterOptions} onChange={updateDraft} />
    </EditRecordPage>
  );
}
