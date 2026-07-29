import { chromium, type FullConfig } from "@playwright/test";
import { existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

const storageState = ".auth/user.json";

export default async function globalSetup(config: FullConfig) {
  if (existsSync(storageState)) return;
  const email = process.env.E2E_EMAIL;
  const password = process.env.E2E_PASSWORD;
  if (!email || !password) return;

  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto(`${config.projects[0]?.use.baseURL ?? "http://127.0.0.1:3000"}/login`);
  await page.getByLabel("Email Address").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL(/\/(dashboard)?$/);
  mkdirSync(dirname(storageState), { recursive: true });
  await page.context().storageState({ path: storageState });
  await browser.close();
}
