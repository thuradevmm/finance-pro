"use client";

import { useEffect, useState } from "react";

import type { Transaction } from "@/types/finance";

const transactionStorageKey = "finance-pro.transactions";

function readTransactionsFromStorage(fallbackTransactions: Transaction[]) {
  if (typeof window === "undefined") {
    return fallbackTransactions;
  }

  const storedValue = window.localStorage.getItem(transactionStorageKey);

  if (!storedValue) {
    return fallbackTransactions;
  }

  try {
    return JSON.parse(storedValue) as Transaction[];
  } catch {
    return fallbackTransactions;
  }
}

export function saveTransactionsToStorage(transactions: Transaction[]) {
  window.localStorage.setItem(transactionStorageKey, JSON.stringify(transactions));
  window.dispatchEvent(new Event("finance-pro:transactions-changed"));
}

export function addTransactionToStorage(transaction: Transaction, fallbackTransactions: Transaction[]) {
  const currentTransactions = readTransactionsFromStorage(fallbackTransactions);

  saveTransactionsToStorage([transaction, ...currentTransactions]);
}

export function updateTransactionInStorage(transaction: Transaction, fallbackTransactions: Transaction[]) {
  const currentTransactions = readTransactionsFromStorage(fallbackTransactions);
  const transactionExists = currentTransactions.some((item) => item.id === transaction.id);
  const nextTransactions = transactionExists
    ? currentTransactions.map((item) => (item.id === transaction.id ? transaction : item))
    : [transaction, ...currentTransactions];

  saveTransactionsToStorage(nextTransactions);
}

export function useStoredTransactions(fallbackTransactions: Transaction[]) {
  const [storedTransactions, setStoredTransactions] = useState(fallbackTransactions);

  useEffect(() => {
    function syncTransactions() {
      setStoredTransactions(readTransactionsFromStorage(fallbackTransactions));
    }

    syncTransactions();
    window.addEventListener("storage", syncTransactions);
    window.addEventListener("finance-pro:transactions-changed", syncTransactions);

    return () => {
      window.removeEventListener("storage", syncTransactions);
      window.removeEventListener("finance-pro:transactions-changed", syncTransactions);
    };
  }, [fallbackTransactions]);

  return storedTransactions;
}
