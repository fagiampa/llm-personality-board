"use client";

import { useLocale } from "@/lib/i18n/context";
import { dict } from "@/lib/i18n/dictionaries";
import { GITHUB_URL } from "@/lib/site";
import styles from "./SiteFooter.module.css";

// One footer for every page: the project is open source. Kept off the cards
// (they stay minimal). The Lightning donation address is off the footer for
// now (2026-10-19, per direct instruction); LIGHTNING_ADDRESS in lib/site.ts
// is kept for when it comes back.
export default function SiteFooter() {
  const t = dict(useLocale()).footer;

  return (
    <footer className={styles.footer}>
      <a href={GITHUB_URL} className={styles.link}>
        {t.openSource}
      </a>
    </footer>
  );
}
