# DLH Fetch & Simulation Flow

## Overview

This documents the end-to-end flow that fetches historical transaction data from the Data Lake Hub (DLH), stages it in a simulation table, and enqueues it for replay through the transaction processing pipeline (DEMS).

---

## Flow Diagram

```
Rule Studio (client)
  └─ FetchFromDlhService
       └─ AdminServiceClient.fetchFromDlh()
            └─ POST /v1/dlh/fetch  →  Admin Service
                  └─ fetchFromDlhHandler  (app.controller.ts)
                       └─ fetchFromDlh()  (simulation-logs.logic.service.ts)
                            └─ fetchDataFromDlh()  (simulation-logs.repository.ts)
                                 ├─ Paginated fetch from DLH
                                 └─ Persist items → sim<NNN> table
```

---

## Step-by-Step

### 1. Rule Studio — `FetchFromDlhService`
**File:** `rule-studio/backend/src/services/fetch-from-dlh/fetch-from-dlh.service.ts`

- Receives an array of `FetchFromDlhQueryDto` objects (each with `txtp`, `mask_fields`, `startDtTm`, `endDtTm`, `endpoint_path`) plus `tenantId` and `token`.
- Builds a `payload` array by appending `tenantId` and a hardcoded `limit: 300` to each query.
- Delegates to `AdminServiceClient.fetchFromDlh(payload, token)`.
- After the response returns:
  - Extracts `tableName` from the response (e.g., `sim001`).
  - Reconstructs the item list from numeric-keyed entries in the response object (an artifact of how `allItems` is spread into the return value in the repository).
  - Builds a `txtp → DEMS endpoint` map by normalising transaction type strings (strips dots, lowercases).
  - Maps each item to a `SimulationMessage`: `{ messageId, timestamp, endpoint, data }`.
  - Calls `truncateEvaluationData` to clear the evaluation results table before the new run.
  - Calls `saveRecordInTrsSimulation` to register the simulation job as `RUNNING` with total message count.
  - Calls `SendToDemsService.enqueueDlhSimulation()` to enqueue messages for processing.
  - Returns `{ tableName, jobId }`.

---

### 2. Rule Studio — `AdminServiceClient`
**File:** `rule-studio/backend/src/services/admin-service-client.ts`

```ts
async fetchFromDlh(queries: Array<Record<string, unknown>>, token: string): Promise<Record<string, unknown>> {
  return await this.executeHttpRequest('POST', FETCH_FROM_DLH, token, queries);
}
```

- `FETCH_FROM_DLH` resolves to `/v1/dlh/fetch` (defined in `constants/constant.ts`).
- `executeHttpRequest` is a thin wrapper over the NestJS `HttpService` that forwards the bearer token and body to the Admin Service base URL.

---

### 3. Admin Service — Route
**File:** `admin-service/src/router.ts`

```
POST /v1/dlh/fetch
```

- Requires one of: `editor`, `approver`, `exporter`, `publisher` roles (via `routePrivilege.fetchFromDlh`).
- Handled by `fetchFromDlhHandler`.

---

### 4. Admin Service — Controller
**File:** `admin-service/src/app.controller.ts`

```ts
export const fetchFromDlhHandler = async (req, reply) => {
  const token = req.headers.authorization ?? '';
  const queries = req.body as Array<Record<string, unknown>>;
  const result = await fetchFromDlh(queries, token);
  reply.code(200).send(result);
};
```

- Extracts the `Authorization` header and passes it downstream so DLH requests are authenticated with the caller's token.
- Sends the raw result back (the spread `allItems` object plus `tableName`).

---

### 5. Admin Service — Logic Service
**File:** `admin-service/src/services/simulation-logs.logic.service.ts`

```ts
export const fetchFromDlh = async (queries, token) => fetchDataFromDlh(queries, token);
```

A thin pass-through to the repository layer.

---

### 6. Admin Service — Repository
**File:** `admin-service/src/repositories/configuration/simulation-logs.repository.ts`

This is where the real work happens.

#### 6a. Paginated fetch from DLH

- Endpoint: `${DLH_URL}/extract/page?page=<N>&size=100`
- Method: `POST` with each query object as the body; bearer token forwarded.
- First request always targets page 1. The response includes `pages` (total page count).
- Remaining pages are fetched sequentially in a loop.
- All `items` arrays from every page and every query are accumulated into `allItems`.

Response shape per page (`DlhPageResponse`):
```ts
{ items: Record<string, unknown>[]; total: number; page: number; size: number; pages: number }
```

#### 6b. Staging table creation

If `allItems` is non-empty:

1. **Count existing sim tables** — queries `information_schema.tables` for names matching `sim%` in the `public` schema of the `simulation` database.
2. **Derive next table name** — `sim001`, `sim002`, etc. (zero-padded to 3 digits).
3. **Create the table** (if not exists):
   ```sql
   CREATE TABLE IF NOT EXISTS sim<NNN> (
     id          SERIAL PRIMARY KEY,
     payload     JSONB NOT NULL,
     credttm     TEXT,
     "endpointPath" TEXT,
     "tenantId"  TEXT,
     "msgid"     TEXT
   )
   ```
4. **Bulk insert** — all items serialised to JSON strings, inserted into `payload` in a single statement.

#### 6c. Return value

```ts
return { ...allItems, tableName: nextTableName };
```

The array items are spread into the object under numeric string keys (`"0"`, `"1"`, ...), alongside a `tableName` string. This is how `FetchFromDlhService` in Rule Studio recovers the items (by filtering keys where `!isNaN(Number(key))`).

If no items were found, returns `{ total: 0 }`.

---

## Supporting Tables

| Table | Database | Purpose |
|---|---|---|
| `sim<NNN>` | `simulation` | Staged raw DLH payloads for one simulation run |
| `evaluation` | `evaluation` | Results written during replay; truncated before each new run |
| `trs_simulation` | `configuration` | Tracks simulation job status (`RUNNING` → `COMPLETED`/`FAILED`) |

---

## Key Design Notes

- **Token propagation** — the caller's bearer token is passed all the way from Rule Studio through Admin Service to DLH. Admin Service never issues its own token.
- **Pagination** — DLH responses are fetched page by page (100 items/page) and fully materialised in memory before being written to the database.
- **Simulation isolation** — each invocation creates a new `sim<NNN>` table rather than overwriting, preserving history across runs.
- **Spread-as-object return** — `{ ...allItems, tableName }` is a non-standard pattern that the caller must explicitly handle by extracting numeric-keyed entries. This is a known quirk.
- **Hardcoded limit** — `FetchFromDlhService` sets `limit: 300` per query, but this is superseded by the repository's own `PAGE_SIZE = 100` pagination against the DLH endpoint.
