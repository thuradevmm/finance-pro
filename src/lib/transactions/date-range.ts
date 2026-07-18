function formatDateInput(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function getDefaultTransactionDateRange(referenceDate = new Date()) {
  const toDate = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), referenceDate.getDate());
  const previousYear = toDate.getFullYear() - 1;
  const lastDayOfTargetMonth = new Date(previousYear, toDate.getMonth() + 1, 0).getDate();
  const fromDate = new Date(previousYear, toDate.getMonth(), Math.min(toDate.getDate(), lastDayOfTargetMonth));

  return {
    dateFrom: formatDateInput(fromDate),
    dateTo: formatDateInput(toDate),
  };
}
