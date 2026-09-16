export type Locale = "en" | "it";

export const DEFAULT_LOCALE: Locale = "en";

// Parses an Accept-Language header ("it-IT,it;q=0.9,en-US;q=0.8,en;q=0.7")
// and picks "it" if that's the browser's highest-priority supported language,
// "en" otherwise. This is "the country in the browser" in the only sense a
// server can actually observe it without an external geo-IP lookup: the
// language the browser is configured for and sends on every request.
export function resolveLocale(acceptLanguageHeader: string | null | undefined): Locale {
  if (!acceptLanguageHeader) return DEFAULT_LOCALE;

  const tags = acceptLanguageHeader
    .split(",")
    .map((part) => {
      const [tag, qPart] = part.trim().split(";q=");
      return { tag: tag.trim().toLowerCase(), q: qPart ? Number(qPart) : 1 };
    })
    .sort((a, b) => b.q - a.q);

  for (const { tag } of tags) {
    if (tag.startsWith("it")) return "it";
    if (tag.startsWith("en")) return "en";
  }
  return DEFAULT_LOCALE;
}

export function dateLocale(locale: Locale): string {
  return locale === "it" ? "it-IT" : "en-US";
}
