export type DebtListEmptyState = {
  description: string;
  title: string;
};

export function getDebtVisibilityToggleState(showActiveOnly: boolean) {
  return showActiveOnly
    ? {
      ariaLabel: "Include paid debts",
      isPressed: false,
      label: "Show paid debts",
    }
    : {
      ariaLabel: "Include paid debts",
      isPressed: true,
      label: "Hide paid debts",
    };
}

export function getDebtListEmptyState({
  hasAnyDebt,
  search,
  showActiveOnly,
}: {
  hasAnyDebt: boolean;
  search: string;
  showActiveOnly: boolean;
}): DebtListEmptyState {
  if (!hasAnyDebt) {
    return {
      description: "Add a debt to track repayment progress.",
      title: "No debts yet",
    };
  }

  if (search.trim() !== "") {
    return {
      description: showActiveOnly
        ? "Try another search or show paid debts too."
        : "Try another search to find a liability.",
      title: showActiveOnly ? "No matching active debts" : "No matching debts",
    };
  }

  if (showActiveOnly) {
    return {
      description: "All liabilities are paid. Show paid debts to review their repayment history.",
      title: "No active debts",
    };
  }

  return {
    description: "Add a debt to track repayment progress.",
    title: "No debts yet",
  };
}
