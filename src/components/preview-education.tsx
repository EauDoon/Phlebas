"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";

import {
  isEducationLastStep,
  PREVIEW_EDUCATION_STEPS,
  PREVIEW_EDUCATION_STORAGE_KEY,
  PREVIEW_EDUCATION_VERSION,
  shouldShowPreviewEducation,
} from "@/lib/preview-education";

import styles from "./terminal.module.css";

function subscribe() {
  return () => undefined;
}

function readStoredVersion(): string | null {
  try {
    return window.localStorage.getItem(PREVIEW_EDUCATION_STORAGE_KEY);
  } catch {
    return null;
  }
}

function serverStoredVersion(): string | null {
  return PREVIEW_EDUCATION_VERSION;
}

export function PreviewEducation({ force = false }: { force?: boolean }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [step, setStep] = useState(0);
  const [dismissed, setDismissed] = useState(false);
  const storedVersion = useSyncExternalStore(subscribe, readStoredVersion, serverStoredVersion);
  const visible = !dismissed && (force || shouldShowPreviewEducation(storedVersion));

  function persistSeen() {
    try {
      window.localStorage.setItem(PREVIEW_EDUCATION_STORAGE_KEY, PREVIEW_EDUCATION_VERSION);
    } catch {
      // Private mode still lets the visitor continue. The banner remains.
    }
  }

  function dismiss() {
    persistSeen();
    setDismissed(true);
    dialogRef.current?.close();
  }

  useEffect(() => {
    function skipNavFocused() {
      return Boolean(document.querySelector('nav[aria-label="Skip links"]')?.matches(":focus-within"));
    }

    function openEducation() {
      const node = dialogRef.current;
      if (!node || !visible || node.open || skipNavFocused()) {
        return;
      }
      node.showModal();
      headingRef.current?.focus();
    }

    const node = dialogRef.current;
    if (!node) return;
    if (visible && !node.open) {
      openEducation();
    }
    if (!visible && node.open) {
      node.close();
    }

    const skipNav = document.querySelector('nav[aria-label="Skip links"]');
    skipNav?.addEventListener("focusout", openEducation);
    return () => skipNav?.removeEventListener("focusout", openEducation);
  }, [visible, step]);

  if (!visible) {
    return null;
  }

  const current = PREVIEW_EDUCATION_STEPS[step];
  const last = isEducationLastStep(step);

  return (
    <dialog
      ref={dialogRef}
      className={styles.educationDialog}
      aria-labelledby="preview-education-title"
      onCancel={(event) => {
        event.preventDefault();
        dismiss();
      }}
    >
      <p className={styles.eyebrow}>
        Step {step + 1} of {PREVIEW_EDUCATION_STEPS.length}. Education, not consent.
      </p>
      <h2 id="preview-education-title" ref={headingRef} tabIndex={-1}>
        {current.title}
      </h2>
      <p role="region" aria-label="Education copy">{current.body}</p>
      <div className={styles.tourNav}>
        <button type="button" disabled={step === 0} onClick={() => setStep((index) => index - 1)}>
          Back
        </button>
        <button
          type="button"
          onClick={last ? dismiss : () => setStep((index) => index + 1)}
        >
          Continue
        </button>
      </div>
    </dialog>
  );
}
