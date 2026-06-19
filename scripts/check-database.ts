import "dotenv/config";

import { prisma } from "../src/lib/prisma";

async function checkDatabase() {
  const [profileCount, accountCount, transactionCount, dashboardRowCount] = await Promise.all([
    prisma.user_profiles.count(),
    prisma.accounts.count(),
    prisma.transactions.count(),
    prisma.v_dashboard_summary.count(),
  ]);

  console.log(
    JSON.stringify({
      connected: true,
      database: "personal_finance_db",
      profileCount,
      accountCount,
      transactionCount,
      dashboardViewReadable: dashboardRowCount >= 0,
    }),
  );
}

checkDatabase()
  .catch((error: unknown) => {
    console.error("Database connection check failed.", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
