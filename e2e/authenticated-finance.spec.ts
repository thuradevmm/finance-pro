import { expect, test } from "@playwright/test";
import { existsSync } from "node:fs";

const hasAuthentication = existsSync(".auth/user.json")
  || Boolean(process.env.E2E_EMAIL && process.env.E2E_PASSWORD);

test.skip(!hasAuthentication, "Set E2E_EMAIL/E2E_PASSWORD or provide .auth/user.json.");

for (const route of ["/dashboard", "/accounts", "/transactions", "/future-planning", "/assets", "/notifications"]) {
  test(`${route} is responsive and visually stable`, async ({ page }, testInfo) => {
    await page.goto(route);
    await expect(page).not.toHaveURL(/\/login/);
    await expect(page.locator("main")).toBeVisible();
    const hasHorizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
    expect(hasHorizontalOverflow).toBe(false);
    await expect(page).toHaveScreenshot(`${testInfo.project.name}-${route.slice(1)}.png`, { fullPage: true });
  });
}
