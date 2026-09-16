import type { Metadata } from "next";
import { SITE_URL, SITE_NAME } from "./site";

// Shared shape for every page's generateMetadata: title/description drive
// both the <title>/<meta description> and the Open Graph / Twitter card
// fields, so a page never forgets to keep them in sync.
export function buildMetadata({
  title,
  description,
  path = "/",
}: {
  title: string;
  description: string;
  path?: string;
}): Metadata {
  const url = `${SITE_URL}${path}`;
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      title,
      description,
      url,
      siteName: SITE_NAME,
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
    },
  };
}
