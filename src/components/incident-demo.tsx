"use client";

import { useId, useState } from "react";

import { GATEWAY_INCIDENTS, type GatewayIncidentId } from "@/lib/gateway-incidents";

import styles from "./terminal.module.css";

export function IncidentDemo({ highlight = false }: { highlight?: boolean }) {
  const labelId = useId();
  const [incidentId, setIncidentId] = useState<GatewayIncidentId>(GATEWAY_INCIDENTS[0].id);
  const incident = GATEWAY_INCIDENTS.find((item) => item.id === incidentId) ?? GATEWAY_INCIDENTS[0];

  return (
    <div className={styles.incidentDemo} id="incident-demo" role="region" aria-labelledby={labelId}>
      <div className={styles.panelHeader}>
        <div>
          <span className={styles.eyebrow}>State demonstration</span>
          <h3 id={labelId}>Blocked, review, reorg, and maintenance copy</h3>
        </div>
      </div>
      <label className={styles.inputLabel}>
        <span>Demonstration</span>
        <div className={styles.inputShell}>
          <select
            aria-label="Gateway incident demonstration"
            value={incident.id}
            onChange={(event) => setIncidentId(event.target.value as GatewayIncidentId)}
          >
            {GATEWAY_INCIDENTS.map((item) => (
              <option key={item.id} value={item.id}>{item.title}</option>
            ))}
          </select>
        </div>
      </label>
      <div className={styles.uriBlock} aria-live="polite">
        <span className={styles.eyebrow}>State demonstration</span>
        <strong>{incident.title}</strong>
        <p>{incident.body}</p>
      </div>
      {highlight && (
        <p className={styles.inlineNotice}>
          Status field architecture-demonstration. Labeled demonstration, not a live outage.
        </p>
      )}
      <p className={styles.inlineNotice}>
        These screens are labeled demonstrations. They do not imply a live account, incident, or outage.
      </p>
    </div>
  );
}
