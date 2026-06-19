export type MockAccount = {
  email: string;
  fullName: string;
  password: string;
};

export const defaultMockAccount: MockAccount = {
  email: "owner@financepro.app",
  fullName: "Aung Finance",
  password: "FinancePro123!",
};

const accountStorageKey = "finance-pro.mock-account";
export const sessionStorageKey = "finance-pro.mock-session";

export function getRegisteredMockAccount() {
  try {
    const storedAccount = window.localStorage.getItem(accountStorageKey);
    return storedAccount ? (JSON.parse(storedAccount) as MockAccount) : null;
  } catch {
    return null;
  }
}

export function saveRegisteredMockAccount(account: MockAccount) {
  window.localStorage.setItem(accountStorageKey, JSON.stringify(account));
}

export function saveMockSession(account: MockAccount, rememberMe = true) {
  const storage = rememberMe ? window.localStorage : window.sessionStorage;
  storage.setItem(
    sessionStorageKey,
    JSON.stringify({ email: account.email, fullName: account.fullName, signedInAt: new Date().toISOString() }),
  );
}
