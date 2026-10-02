"use client";

import { useState } from "react";
import { useLocale } from "@/lib/i18n/context";
import { dict } from "@/lib/i18n/dictionaries";
import { GITHUB_URL, LIGHTNING_ADDRESS } from "@/lib/site";
import styles from "./SiteFooter.module.css";

// One footer for every page: the project is open source, and donations go
// to a Lightning Address. Kept off the cards (they stay minimal).
export default function SiteFooter() {
  const t = dict(useLocale()).footer;
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(LIGHTNING_ADDRESS);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard blocked: the address is still selectable as text.
    }
  }

  return (
    <footer className={styles.footer}>
      <a href={GITHUB_URL} className={styles.link}>
        {t.openSource}
      </a>
      <span className={styles.support}>
        {t.support}{" "}
        <a href={`lightning:${LIGHTNING_ADDRESS}`} className={styles.address}>
          {LIGHTNING_ADDRESS}
        </a>
        <button type="button" className={styles.copy} onClick={copy} aria-label={t.copyAriaLabel}>
          {copied ? t.copied : t.copy}
        </button>
      </span>
    </footer>
  );
}
