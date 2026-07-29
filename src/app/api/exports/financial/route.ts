import { NextRequest, NextResponse } from "next/server";

import { getAccounts } from "@/lib/accounts/supabase";
import { getCategories } from "@/lib/categories/supabase";
import { exportTableToCsv, exportTableToPdf, exportTableToXlsx, type ExportTable } from "@/lib/exports/financial-export";
import { buildFinancialReport, type FinancialReportGroup } from "@/lib/reports/financial-report";
import { getUserSafely } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";
import { getTransactions } from "@/lib/transactions/supabase";

export const dynamic = "force-dynamic";

function safeDate(value: string | null) {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : undefined;
}

function reportGroup(value: string | null): FinancialReportGroup {
  return value === "account" || value === "category" ? value : "month";
}

function transactionsTable(transactions: Awaited<ReturnType<typeof getTransactions>>, dateFrom?: string, dateTo?: string): ExportTable {
  const rows = transactions.filter((transaction) => (
    (!dateFrom || transaction.dateValue >= dateFrom)
    && (!dateTo || transaction.dateValue <= dateTo)
  ));
  return {
    columns: ["Date", "Type", "Title", "Account", "Category", "Status", "Native Amount", "Currency", "Base Amount", "Base Currency", "Note"],
    rows: rows.map((transaction) => [
      transaction.dateValue,
      transaction.type === "Income" ? "Credit" : transaction.type === "Expense" ? "Debit" : "Transfer",
      transaction.title,
      transaction.account,
      transaction.category,
      transaction.status,
      transaction.amountValue,
      transaction.currency,
      transaction.hasExchangeRate ? transaction.amountBaseValue : "Missing rate",
      transaction.baseCurrency,
      transaction.note,
    ]),
    title: "Transactions",
  };
}

function reportTable(
  transactions: Awaited<ReturnType<typeof getTransactions>>,
  group: FinancialReportGroup,
  dateFrom?: string,
  dateTo?: string,
): ExportTable {
  const report = buildFinancialReport(transactions, { dateFrom, dateTo, group });
  return {
    columns: [group[0].toUpperCase() + group.slice(1), "Credits", "Debits", "Net", "Transactions"],
    rows: report.rows.map((row) => [row.label, row.credit, row.debit, row.net, row.transactionCount]),
    title: `Financial Report by ${group}`,
  };
}

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { user } = await getUserSafely(supabase);
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

  const dataset = request.nextUrl.searchParams.get("dataset") === "transactions" ? "transactions" : "report";
  const format = request.nextUrl.searchParams.get("format") ?? "csv";
  if (!["csv", "xlsx", "pdf"].includes(format)) {
    return NextResponse.json({ error: "Format must be csv, xlsx, or pdf." }, { status: 400 });
  }
  const dateFrom = safeDate(request.nextUrl.searchParams.get("dateFrom"));
  const dateTo = safeDate(request.nextUrl.searchParams.get("dateTo"));
  const group = reportGroup(request.nextUrl.searchParams.get("group"));
  const [accounts, categories] = await Promise.all([
    getAccounts(supabase, user.id, { asOfDate: dateTo, limit: 500 }),
    getCategories({ limit: 500 }),
  ]);
  const transactions = await getTransactions(supabase, user.id, accounts, categories);
  const table = dataset === "transactions"
    ? transactionsTable(transactions, dateFrom, dateTo)
    : reportTable(transactions, group, dateFrom, dateTo);
  const filename = `${dataset}-${new Date().toISOString().slice(0, 10)}.${format}`;
  const headers = {
    "Cache-Control": "private, no-store",
    "Content-Disposition": `attachment; filename="${filename}"`,
  };

  if (format === "csv") {
    return new NextResponse(exportTableToCsv(table), {
      headers: { ...headers, "Content-Type": "text/csv; charset=utf-8" },
    });
  }
  if (format === "xlsx") {
    return new NextResponse(exportTableToXlsx(table).slice().buffer as ArrayBuffer, {
      headers: { ...headers, "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" },
    });
  }
  return new NextResponse((await exportTableToPdf(table)).slice().buffer as ArrayBuffer, {
    headers: { ...headers, "Content-Type": "application/pdf" },
  });
}
