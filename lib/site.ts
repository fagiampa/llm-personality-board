// Single point to update once the real production domain is known — every
// SEO-facing surface (sitemap, robots.txt, canonical URLs, Open Graph tags)
// reads from here instead of hardcoding a domain. Falls back to a Vercel
// preview-style placeholder until NEXT_PUBLIC_SITE_URL is set in .env /
// Vercel project settings.
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://llm-personality-board.vercel.app").replace(
  /\/$/,
  ""
);

export const SITE_NAME = "LLM Personality Board";

// Donations, Lightning Network (LUD-16 address). Shown in the site footer and README.
export const LIGHTNING_ADDRESS = "tennicodabar@getalby.com";

export const GITHUB_URL = "https://github.com/fagiampa/llm-personality-board";
