"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import {
  PREVIEW_CHIP_HREF,
  PREVIEW_CHIP_STORAGE_KEY,
  PREVIEW_CHIP_TEXT,
  previewChipStatusRole,
} from "@/lib/preview-chip";

import styles from "./preview-chip.module.css";

let previewChipAnnounced = false;

export function PreviewChip() {
  const [alreadyAnnounced] = useState(() => previewChipAnnounced);
  const role = previewChipStatusRole(alreadyAnnounced);

  useEffect(() => {
    previewChipAnnounced = true;
    try {
      sessionStorage.setItem(PREVIEW_CHIP_STORAGE_KEY, "1");
    } catch {
      // sessionStorage may be blocked; the module flag still covers client navigations.
    }
  }, []);

  return (
    <div className={styles.bar} role={role}>
      <Link href={PREVIEW_CHIP_HREF} className={styles.chip}>
        {PREVIEW_CHIP_TEXT}
      </Link>
    </div>
  );
}
