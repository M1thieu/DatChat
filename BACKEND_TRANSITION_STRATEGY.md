# Backend Transition Strategy: Matrix First, Native Later

Date: 2026-02-11

## Short Answer

Starting with Matrix and later building your own backend is feasible.

It becomes overengineering only if you attempt both at once in V2.

## Recommended Path

1. Build V2 on Matrix first (to mirror Element accurately and ship faster).
2. In parallel, run a native-backend R&D track as a side project.
3. Move production only after feature parity + reliability targets are met.

## Why This Is the Right Tradeoff

1. Element is deeply Matrix-coupled.
2. Matrix-first gets you near-1:1 behavior now.
3. Native backend can be designed cleanly without blocking V2 shipping.

## Non-Overengineering Rules

1. Single production backend at a time:
- V2 production = Matrix.

2. Native backend track is read-only/experimental until proven.

3. No "half migration" in user-facing runtime.

4. Define strict cutover gates before moving off Matrix.

## Architectural Guardrails (Set Now)

Create explicit boundaries so future migration is realistic:

1. Domain contracts
- define internal app contracts for:
  - identity/session
  - rooms/membership
  - messages/reactions/pins
  - media
  - realtime events

2. Gateway abstraction
- isolate protocol-specific adapters behind interfaces:
  - `MatrixAdapter` (current prod path)
  - `NativeAdapter` (future path)

3. Event model
- normalize all message events into a transport-agnostic shape in app layer.

4. Data migration tooling
- build export/import scripts early in design, even if not used yet.

## When Rust/Scylla Make Sense

Rust:
- good for high-performance realtime services and protocol gateways.

ScyllaDB:
- good for very high write throughput/event storage at scale.

Do not use them in V1/V2 bootstrap unless needed immediately.
Premature adoption increases delivery risk.

## Suggested Timing

Phase A (now):
- Matrix production, Element mirror work.

Phase B (after V2 core stable):
- native backend proof-of-concept in Rust.
- optional storage experiments (Postgres vs Scylla).

Phase C (only with evidence):
- shadow traffic + replay tests.
- staged cutover for limited cohorts.

## Cutover Readiness Gates

All must pass:

1. Feature parity with V2 core scope.
2. Equal or better latency and reliability.
3. Realtime correctness under reconnect/network churn.
4. Data migration repeatability (dry-run success multiple times).
5. Rollback path tested.

## Practical Conclusion

Matrix-first plus a disciplined native R&D track is the best path for your goal.
Trying to replace Matrix before V2 ships is high-risk and likely to stall progress.
