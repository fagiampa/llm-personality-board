import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

// Every route is a single URL regardless of viewer language (locale is
// chosen from Accept-Language at request time, not a /en or /it path) — see
// lib/i18n/. That also means a crawler only ever sees whichever language it
// requests with, typically English.
export default function sitemap(): MetadataRoute.Sitemap {
  const routes: { path: string; changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"]; priority: number }[] = [
    { path: "/", changeFrequency: "daily", priority: 1 },
    { path: "/about", changeFrequency: "monthly", priority: 0.5 },
    { path: "/methodology", changeFrequency: "monthly", priority: 0.7 },
    { path: "/considerations", changeFrequency: "monthly", priority: 0.5 },
  ];

  return routes.map((route) => ({
    url: `${SITE_URL}${route.path}`,
    lastModified: new Date(),
    changeFrequency: route.changeFrequency,
    priority: route.priority,
  }));
}
