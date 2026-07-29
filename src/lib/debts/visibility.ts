export type DebtListEmptyState = {
  description: string;
  title: string;
};

export function getDebtVisibilityToggleState(showActiveOnly: boolean) {
  return showActiveOnly
    ? {
      ariaLabel: "Include completed borrowing and lending records",
      isPressed: false,
      label: "Show completed records",
    }
    : {
      ariaLabel: "Include completed borrowing and lending records",
      isPressed: true,
      label: "Hide completed records",
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
      description: "Add borrowing or lending to track payments, returns, and progress.",
      title: "No borrowing or lending yet",
    };
  }

  if (search.trim() !== "") {
    return {
      description: showActiveOnly
        ? "Try another search or show completed records too."
        : "Try another search to find a borrowing or lending record.",
      title: showActiveOnly ? "No matching active records" : "No matching records",
    };
  }

  if (showActiveOnly) {
    return {
      description: "All borrowing and lending records are completed. Show completed records to review their history.",
      title: "No active borrowing or lending",
    };
  }

  return {
    description: "Add borrowing or lending to track payments, returns, and progress.",
    title: "No borrowing or lending yet",
  };
}
