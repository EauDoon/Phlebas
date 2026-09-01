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
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (visible && !dialog.open) {
      dialog.showModal();
      headingRef.current?.focus();
    }
    if (!visible && dialog.open) {
      dialog.close();
    }
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
        {last ? (
          <button type="button" onClick={dismiss}>Enter simulation</button>
        ) : (
          <button type="button" onClick={() => setStep((index) => index + 1)}>Continue</button>
        )}
      </div>
    </dialog>
  );
}
