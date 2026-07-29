import { NextResponse } from "next/server";

import { syncTransactions } from "@/app/transactions/actions";
import type { TransactionFormData } from "@/lib/transactions/supabase";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }
  const transactions = body && typeof body === "object" && Array.isArray((body as { transactions?: unknown }).transactions)
    ? (body as { transactions: TransactionFormData[] }).transactions
    : null;
  if (!transactions) {
    return NextResponse.json({ error: "Provide a transactions array." }, { status: 400 });
  }
  const result = await syncTransactions(transactions);
  const status = result.errors.length > 0 && result.created + result.updated + result.skipped === 0 ? 422 : 200;
  return NextResponse.json(result, { status });
}
