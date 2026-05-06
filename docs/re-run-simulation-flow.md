# Re-Run Simulation Flow

## Overview

This documents the end-to-end flow for **re-running an existing simulation**. When a simulation has already been run and its transaction data is already staged in a database table (e.g. `sim001`), the frontend can trigger a fresh replay through the transaction processing pipeline (DEMS) without fetching from the Data Lake Hub (DLH) again.

The re-run flow is a shorter, faster path compared to the original DLH fetch flow:
- No DLH queries are built
- No new staging table is created
- The same staged data is replayed with a new iteration of evaluation results

---

## High-Level Flow Diagram

```
Frontend
  └─ POST /simulation/rerun  { tableName: "sim001" }
       └─ Rule Studio — SimulationController
            └─ RerunSimulationService.rerunSimulation()
                 ├─ AdminServiceClient.getSimulationItems()
                 │    └─ GET /v1/admin/simulation/items?tableName=sim001
                 │         └─ Admin Service — fetchSimulationItemsHandler
                 │              └─ fetchSimulationItemsFromTable("sim001")
                 │                   └─ SELECT payload, endpointPath, credttm, tenantId, msgid
                 │                        FROM sim001 ORDER BY credttm ASC
                 │
                 ├─ AdminServiceClient.truncateEvaluationData()
                 │    └─ TRUNCATE TABLE evaluation  (clears evaluation staging)
                 │
                 ├─ AdminServiceClient.saveRecordInTrsSimulation()
                 │    └─ INSERT INTO trs_simulation  (status: RUNNING)
                 │
                 └─ SendToDemsService.enqueueDlhSimulation()
                      └─ BullMQ job enqueued  →  { jobId }
                           └─ SimulationProcessor (worker)
                                ├─ POST each message → DEMS endpoint (in order, with timing)
                                ├─ WebSocket progress events  →  Frontend
                                └─ FetchEvaluationService.fetchEvaluation()
                                     ├─ GET all evaluation results
                                     ├─ INSERT INTO sim001_results  (new iteration)
                                     └─ UPDATE trs_simulation  (status: COMPLETED)
```

---

## Step-by-Step

### 1. Frontend — Trigger Re-Run

The frontend sends a single `POST` request with just the table name. No date range, no query building — the data is already staged.

```
POST {rule-studio-url}/simulation/rerun
Authorization: Bearer <token>
Body: { "tableName": "sim001" }
```

---

### 2. Rule Studio — `SimulationController`
**File:** `rule-studio/backend/src/simulation/simulation.controller.ts`

- Receives the request and extracts the `Authorization` header.
- Delegates entirely to `RerunSimulationService.rerunSimulation(tableName, token)`.
- Returns `{ jobId, tableName }` immediately — the actual replay is asynchronous.

---

### 3. Rule Studio — `RerunSimulationService`
**File:** `rule-studio/backend/src/services/rerun-simulation/rerun-simulation.service.ts`

This is the orchestrator for the re-run. It performs the following steps in sequence:

#### Step 3a — Fetch staged items from the sim table

Calls `AdminServiceClient.getSimulationItems(token, tableName)`.

This returns all rows from the existing sim table (e.g. `sim001`), ordered by `credttm` ascending (i.e. in their original chronological order). Each row contains:
- `payload` — the full transaction document that was sent during the original run
- `endpointPath` — the DEMS path to send it to (e.g. `/cbe/1.0/evaluate/dems_pacs002`)
- `credttm` — the original transaction timestamp (used for timing replay)
- `tenantId` — the tenant that owns this transaction
- `msgid` — the original message ID

If the table is empty, an error is returned immediately — there is nothing to re-run.

#### Step 3b — Derive `tenantId`

Uses `tenantId` from the first row. If somehow missing, defaults to `'DEFAULT'`.

#### Step 3c — Build the replay message list

Each row from the sim table is converted into a `DirectSimulationMessage`:

| Field | Source |
|---|---|
| `messageId` | `row.msgid` (or a fresh UUID if absent) |
| `timestamp` | `row.credttm` (or current time if absent) |
| `endpoint` | `DEMS_BASE_URL + row.endpointPath` |
| `data` | `row.payload` (the full transaction document) |

These are the same message objects used by the original DLH-fetch flow, so the BullMQ processor handles them identically.

#### Step 3d — Clear the evaluation staging table

Calls `AdminServiceClient.truncateEvaluationData()` → `TRUNCATE TABLE evaluation`.

This clears the intermediate evaluation table where DEMS writes rule results during processing. Without this, results from the previous run would contaminate the new run's evaluation fetch.

#### Step 3e — Record the simulation as RUNNING

Calls `AdminServiceClient.saveRecordInTrsSimulation()` with:
- `simulationId`: the table name (e.g. `sim001`)
- `totalRecord`: number of messages about to be sent
- `recordProcessed`: `0`
- `simStatus`: `'RUNNING'`

This creates a tracking record in the `trs_simulation` table.

#### Step 3f — Enqueue the replay job

Calls `SendToDemsService.enqueueDlhSimulation(messages, token, tableName, tenantId, totalMessages)`.

This adds a job to the BullMQ `simulation` queue and returns a `jobId`. Control returns to the caller immediately — the heavy lifting happens asynchronously in the worker.

---

### 4. Rule Studio — `SimulationProcessor` (BullMQ Worker)
**File:** `rule-studio/backend/src/queues/simulation.processor.ts`

The worker picks up the job from the queue. Because the job payload contains a `messages` array (the `DirectSimulationMessage[]` built in Step 3c), the worker takes the **direct-data path** — it does not need to go back to the database to load messages.

#### Message delivery loop

For each message, in order:
1. **Wait** for the gap between this message's `timestamp` and the previous one (capped at 2 seconds). This replays the original timing of the transaction sequence.
2. Strip `DataCache` from the payload (internal field not intended for DEMS).
3. `POST` the payload to `message.endpoint` with `Authorization`, `X-Message-Id`, and `X-Timestamp` headers.
4. A per-message failure is **non-fatal** — it is logged and emitted to the WebSocket but the loop continues.

#### Progress updates (WebSocket)

The processor emits progress events to the frontend via the WebSocket gateway at every 5% milestone. Clients connect to the `/simulation` namespace and join with `{ jobId }` to receive:

```
{ jobId, progress: 0–100, processed, total, status: 'running' | 'completed' | 'failed', log: { ... } }
```

The final event always emits `progress: 100, status: 'completed'`.

---

### 5. Rule Studio — `FetchEvaluationService`
**File:** `rule-studio/backend/src/services/fetch-evaluation/fetch-evaluation.service.ts`

Called automatically by the processor after all messages are sent. It:

1. Calls `AdminServiceClient.getAllEvaluations(token)` → `GET /v1/admin/reports/evaluations`
   - This reads every row from the `evaluation` table (where DEMS deposited rule results during processing).

2. Calls `AdminServiceClient.saveEvaluationsInResultsTable(token, evaluations, tableName)`
   - Persists results into `sim001_results` (created if it doesn't exist).
   - Each re-run gets its own **iteration number** (auto-incremented from the previous maximum). This means re-run results sit alongside first-run results — they are never overwritten.
   - Primary key: `(messageid, tenantid, iteration)`.

3. Calls `AdminServiceClient.saveRecordInTrsSimulation()` with `simStatus: 'COMPLETED'` and the final `recordProcessed` count.

---

## Data Stores Involved

| Store | Table | What happens |
|---|---|---|
| Simulation DB | `sim001` (the existing table) | Read-only during re-run — rows are fetched to build the message list |
| Evaluation DB | `evaluation` | Truncated before replay; DEMS writes fresh rule results here during processing |
| Simulation DB | `sim001_results` | New iteration of evaluation results appended after replay completes |
| Simulation DB | `trs_simulation` | Updated from `RUNNING` → `COMPLETED` |

---

## Key Differences vs. First-Run (DLH Fetch Flow)

| Aspect | First Run | Re-Run |
|---|---|---|
| Data source | DLH (`/extract/page`) | Existing sim table (`sim001`) |
| Staging | Creates a new `simNNN` table | Uses the existing table — no new table |
| Query building | Requires `txtp`, `startDtTm`, `endDtTm` | Only needs `tableName` |
| Entry point | `FetchCountService` → `FetchFromDlhService` | `RerunSimulationService` |
| Message delivery | Same `SimulationProcessor` worker | Same `SimulationProcessor` worker |
| Evaluation fetch | Same `FetchEvaluationService` | Same `FetchEvaluationService` |
| Results storage | Creates `simNNN_results` (iteration 1) | Appends to `sim001_results` (iteration N+1) |

---

## Relevant Files at a Glance

### Rule Studio
| File | Role |
|---|---|
| [`src/simulation/simulation.controller.ts`](../../../rule-studio/backend/src/simulation/simulation.controller.ts) | HTTP entry point — `POST /simulation/rerun` |
| [`src/services/rerun-simulation/rerun-simulation.service.ts`](../../../rule-studio/backend/src/services/rerun-simulation/rerun-simulation.service.ts) | Orchestrator — loads items, builds messages, enqueues job |
| [`src/services/rerun-simulation/dto/rerun-simulation.dto.ts`](../../../rule-studio/backend/src/services/rerun-simulation/dto/rerun-simulation.dto.ts) | Request/response shapes |
| [`src/services/admin-service-client.ts`](../../../rule-studio/backend/src/services/admin-service-client.ts) | HTTP client — `getSimulationItems`, `truncateEvaluationData`, etc. |
| [`src/services/send-to-dems/send-to-dems.service.ts`](../../../rule-studio/backend/src/services/send-to-dems/send-to-dems.service.ts) | Enqueues the BullMQ replay job |
| [`src/queues/simulation.processor.ts`](../../../rule-studio/backend/src/queues/simulation.processor.ts) | BullMQ worker — delivers messages to DEMS, emits WebSocket events |
| [`src/services/fetch-evaluation/fetch-evaluation.service.ts`](../../../rule-studio/backend/src/services/fetch-evaluation/fetch-evaluation.service.ts) | Post-replay — collects and persists evaluation results |
| [`src/simulation/simulation.module.ts`](../../../rule-studio/backend/src/simulation/simulation.module.ts) | NestJS module wiring |
| [`src/constants/constant.ts`](../../../rule-studio/backend/src/constants/constant.ts) | `SIMULATION_ITEMS` endpoint constant |

### Admin Service
| File | Role |
|---|---|
| [`src/app.controller.ts`](../src/app.controller.ts) | `fetchSimulationItemsHandler` — reads sim table rows |
| [`src/router.ts`](../src/router.ts) | `GET /v1/admin/simulation/items` route registration |
| [`src/services/simulation-logs.logic.service.ts`](../src/services/simulation-logs.logic.service.ts) | `fetchSimulationItems` logic wrapper |
| [`src/repositories/configuration/simulation-logs.repository.ts`](../src/repositories/configuration/simulation-logs.repository.ts) | `fetchSimulationItemsFromTable` — the actual SQL query |
| [`src/repositories/configuration/evaluation.repository.ts`](../src/repositories/configuration/evaluation.repository.ts) | `saveEvaluationsInDb` — appends new iteration to `_results` table |
