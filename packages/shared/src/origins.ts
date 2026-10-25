/** Canonical exact origins: tolerate pasted whitespace, never wildcard subdomains. */
export function parseOrigins(value: string, httpsOnly = false): string[] {
  const origins = value.split(",").map((part) => {
    const url = new URL(part.trim());
    if (
      !["https:", ...(httpsOnly ? [] : ["http:"])].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.pathname !== "/" ||
      url.search ||
      url.hash
    )
      throw Error("INVALID_ALLOWED_ORIGIN");
    return url.origin;
  });
  return [...new Set(origins)];
}
