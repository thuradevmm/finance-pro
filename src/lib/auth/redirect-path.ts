const redirectValidationOrigin = "https://finance-pro.local";

/**
 * Returns a same-origin application path suitable for an auth redirect.
 * URL parsing is intentional: browsers treat backslashes in special URLs as
 * path separators, so prefix checks alone do not reject every external URL.
 */
export function safeLocalRedirectPath(value: string | null | undefined, fallback = "/") {
  if (!value?.startsWith("/")) return fallback;

  try {
    const baseUrl = new URL(redirectValidationOrigin);
    const redirectUrl = new URL(value, baseUrl);
    if (redirectUrl.origin !== baseUrl.origin) return fallback;
    return `${redirectUrl.pathname}${redirectUrl.search}${redirectUrl.hash}`;
  } catch {
    return fallback;
  }
}
