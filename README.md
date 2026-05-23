# Transaction Reconciliation Engine (TypeScript)

A high-performance, robust cryptocurrency **Transaction Reconciliation Engine** built in Node.js, Express, MongoDB, and fully typed in **TypeScript**. This service ingests transaction history exports from two distinct sources (the User and the Exchange), validates and flags data quality issues, matches transaction rows using configurable tolerances, and generates structured side-by-side reconciliation reports in both JSON and CSV formats.

---

## Table of Contents
1. [Overview & Job Details](#overview--job-details)
2. [Key Architectural & Business Decisions](#key-architectural--business-decisions)
3. [TypeScript Configurations & Interfaces](#typescript-configurations--interfaces)
4. [API Reference & Usage](#api-reference--usage)
5. [Local Development Setup](#local-development-setup)
6. [Docker & Containerized Setup](#docker--containerized-setup)
7. [Running Tests](#running-tests)
8. [Ingestion & Reconciliation Logic Case Study](#ingestion--reconciliation-logic-case-study)
9. [Testing the Deployed Instance](#testing-the-deployed-instance)

---

## Overview & Job Details

*   **Commitment:** Part-time (20-25 hours/week)
*   **Role:** Backend Developer Take Home Assignment (KoinX)
*   **Goal:** Reconcile messy, asymmetric transaction exports (User CSV vs. Exchange CSV), detect direct matches, report key conflicts, list unmatched items, flag ingestion validation errors, and expose REST APIs to control the engine.

---

## Key Architectural & Business Decisions

To address unclear requirements and handle realistic, messy transaction histories, the following architectural choices were made:

### 1. Mathematical ID Mapping Suffix (`USR-XXX` <-> `EXC-1XXX`)
In the sample datasets, user transaction IDs (`USR-001`, `USR-002`, etc.) correspond to exchange transaction IDs (`EXC-1001`, `EXC-1002`, etc.).
*   **Decision:** The engine implements a mathematical suffix mapping: `parseInt(userTx.id) === parseInt(exchangeTx.id) - 1000`. This direct correlation acts as a primary identifier.
*   **Behavior:** If two transactions match on this ID criteria but their key fields (quantity or timestamp) differ beyond the strict tolerances, they are immediately categorized as **CONFLICTING** (with specific details on which fields failed), rather than being left as unmatched.

### 2. Proximity Matching Fallback
*   **Decision:** In cases where transaction IDs do not match or follow standard schemas, the engine falls back to matching by **Proximity** (same normalized asset, matching type, and timestamps within a proximity window, defaulting to 1 hour).
*   **Behavior:** If the proximity criteria are met but the quantity difference exceeds tolerance, the pair is flagged as **CONFLICTING**.

### 3. Non-Dropping Data Validation
*   **Decision:** No rows are silently ignored.
*   **Behavior:** Rows containing malformed timestamps (e.g. `2024-03-09T`), missing key fields, negative quantities, or internal duplicate transaction IDs within the same file are marked as `INVALID`.
*   **Outcome:** These invalid records are saved to the database alongside a list of `validationErrors` reasons. They are returned in the unmatched endpoints and appear in the CSV export under the categories `INGESTION_ERROR_USER` or `INGESTION_ERROR_EXCHANGE`.

### 4. Dual-Perspective Type Mapping
*   **Decision:** The engine supports equivalent type mapping to reconcile opposite perspectives of the same transfer transaction:
    *   `TRANSFER_OUT` (User side) matches `TRANSFER_IN` (Exchange side).
    *   `BUY` matches `BUY`.
    *   `SELL` matches `SELL`.

### 5. Asset Alias Normalization
*   **Decision:** Both asset names are normalized (case-insensitive) using a preconfigured dictionary before matching:
    *   `bitcoin` or `Bitcoin` or `btc` -> normalized to `BTC`.
    *   `ethereum` or `eth` -> normalized to `ETH`.
    *   `tether` or `usdt` -> normalized to `USDT`, and so on.

---

## TypeScript Configurations & Interfaces

We compile TypeScript using Node's target standard (`ES2022`) via CommonJS for 100% environment compatibility:

### 1. Model Interfaces
*   `IReconciliationRun`: Strongly typed configuration, status, and summary counts.
*   `IIngestedTransaction`: Parsed schema types, duplicate status, and raw row mappings.
*   `IReconciliationRecord`: Strict pairings linking user and exchange ObjectIds with categorization rationale.

### 2. TS Scripts Configuration
*   `npm run build`: Invokes `tsc` to compile files from `/src` into `/dist`.
*   `npm run dev`: Uses `nodemon` and `ts-node` to run and hot-reload `src/server.ts`.
*   `npm test`: Uses `ts-jest` to execute TypeScript unit and integration tests directly.

---

## API Reference & Usage

### 1. Trigger Reconciliation Run
*   **Endpoint:** `POST /api/reconcile`
*   **Content-Type:** `multipart/form-data`
*   **Form Fields:**
    *   `user_transactions`: User CSV file export
    *   `exchange_transactions`: Exchange CSV file export
    *   `timestampToleranceSeconds`: (Optional) integer, default `300` (5 mins)
    *   `quantityTolerancePct`: (Optional) float, default `0.01` (0.01%)
    *   `proximityWindowSeconds`: (Optional) integer, default `3600` (1 hour)
*   **Response (201 Created):**
    ```json
    {
      "success": true,
      "message": "Reconciliation run completed successfully.",
      "runId": "a2444c9b-64e0-47cb-bf50-fa0d02462e08",
      "config": {
        "timestampToleranceSeconds": 300,
        "quantityTolerancePct": 0.01,
        "proximityWindowSeconds": 3600
      },
      "summary": {
        "matchedCount": 16,
        "conflictingCount": 1,
        "unmatchedUserCount": 1,
        "unmatchedExchangeCount": 2,
        "invalidUserCount": 3,
        "invalidExchangeCount": 0
      }
    }
    ```

### 2. Fetch Full Reconciliation Report
*   **Endpoint:** `GET /api/report/:runId`
*   **Query Parameters:** `format=csv` (Optional - downloads a formatted CSV attachment instead of returning JSON)
*   **Response (200 OK - JSON format):**
    ```json
    {
      "success": true,
      "runId": "a2444c9b-64e0-47cb-bf50-fa0d02462e08",
      "config": { ... },
      "summary": { ... },
      "records": [
        {
          "runId": "a2444c9b-64e0-47cb-bf50-fa0d02462e08",
          "category": "MATCHED",
          "userTransactionId": "USR-001",
          "exchangeTransactionId": "EXC-1001",
          "userTransaction": { ... },
          "exchangeTransaction": { ... },
          "reason": "Matched successfully on asset BTC, type, timestamp (diff 32s, tolerance ±300s), and quantity (diff 0%, tolerance ±0.01%)."
        },
        ...
      ]
    }
    ```

---

## Local Development Setup

### Prerequisites
*   Node.js (v18 or higher recommended)
*   MongoDB installed and running locally on port 27017

### Step 1: Install Dependencies
```bash
npm install
```

### Step 2: Set Up Configuration
Copy `.env.example` to `.env` and adjust settings as needed:
```bash
cp .env.example .env
```

### Step 3: Run the Server locally (Hot reload)
To start the application in development mode with `ts-node` auto-reload:
```bash
npm run dev
```
The server will boot up locally at `http://localhost:3000`.

---

## Docker & Containerized Setup

You can run the entire system (TypeScript compiled Node.js App + MongoDB) containerized using Docker and Docker Compose.

### Step 1: Start the services
```bash
docker-compose up --build
```
This automatically compiles the TypeScript source code to `/dist` inside the container, starts up a local MongoDB container, and boots up the API.

### Step 2: Stop the services
```bash
docker-compose down
```

---

## Running Tests

To execute the Jest TypeScript test suite:
```bash
npm test
```

---

## Ingestion & Reconciliation Logic Case Study

When you upload the provided messy sample files, the engine demonstrates its robust behavior in these specific ways:

1.  **Duplicate Transaction Rows**:
    `user_transactions.csv` contains `USR-001` twice.
    *   *Engine action:* Ingestion marks the first row as `VALID`. The second row is flagged as `INVALID` with error `"Duplicate transaction_id in file: USR-001"` and excluded from matching.
2.  **Asset Normalization**:
    `USR-005` lists asset `bitcoin` while `EXC-1005` lists `BTC`.
    *   *Engine action:* Both normalize to `BTC`. They match successfully within the 5-minute and 0.01% tolerances.
3.  **Conflict Identification**:
    `USR-012` has quantity `0.3`, while `EXC-1012` has `0.3001` (a `0.0333%` difference).
    *   *Engine action:* They are paired by ID suffix mapping, but because `0.0333%` exceeds the default tolerance of `0.01%`, they are categorized as **CONFLICTING** with a clear explanation: `"Matched by transaction ID suffix, but key fields differ beyond tolerance: quantity diff of 0.0333% exceeds tolerance of ±0.01% (User: 0.3, Exchange: 0.3001)"`.
4.  **Transaction Perspective Equivalents**:
    `USR-004` lists `TRANSFER_OUT` while `EXC-1004` lists `TRANSFER_IN`.
    *   *Engine action:* They are successfully mapped and categorized as a success **MATCHED** pair.
5.  **Invalid Formats**:
    `USR-018` contains malformed timestamp `2024-03-09T`, and `USR-019` contains negative quantity `-0.1`.
    *   *Engine action:* Ingested as `INVALID` with detailed descriptions and added as an ingestion audit trail.

---

## Testing the Deployed Instance

For quick evaluation and testing without local installation, this Transaction Reconciliation Engine is live and deployed on a VPS:

*   **Live Base URL:** `http://195.35.23.33:3002/`
*   **Live Health Check:** `http://195.35.23.33:3002/health`

### Live Testing with `curl`

To trigger a live reconciliation run on the hosted instance using the provided CSV files, run the following command in your terminal from the project directory:

```bash
curl -X POST http://195.35.23.33:3002/api/reconcile \
  -F "user_transactions=@user_transactions.csv" \
  -F "exchange_transactions=@exchange_transactions.csv"
```

This returns a JSON response containing a unique `runId` and the matching statistics (e.g., matched, conflicting, unmatched, and ingestion error counts).

To download the complete, side-by-side reconciliation report in CSV format from the live deployment, use the returned `runId` in the following command:

```bash
curl -o report.csv "http://195.35.23.33:3002/api/report/<runId>?format=csv"
```
