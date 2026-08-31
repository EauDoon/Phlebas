# Operations hardening changelog

This file tracks changes to the operations hardening surface.
Each entry must include the date, the previous and new state, and
the reason for the change.

## 01-09-2026 — initial surface

- Metrics counter: in-memory only, Prometheus text rendering.
- SLO tracker: rolling-window compliance verdict, 10_000 sample
  cap per key.
- Health aggregator: pure function over per-service records.
- Alert router: per-service per-severity routing table.

The initial surface is intentionally minimal. A later PR will
add a Prometheus remote-write adapter and a SLO sample
persistence layer.
