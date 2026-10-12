# Suba Finance — End-to-End Project Summary

> **Offline-First Gold & Silver Pawn Loan Management & RBI Compliance System**  
> *Built with React, TypeScript, Tailwind CSS, IndexedDB, and Web Cryptography.*

---

## 1. Executive Summary

**Suba Finance** is a specialized, production-ready pawn-broking and collateralized gold/silver lending web application tailored for the Indian regulatory landscape. It adheres strictly to the **RBI Master Directions (2025/2026 rubric)** for gold loans, incorporating:

- **Tiered Loan-to-Value (LTV) limits** (up to 85% for micro loans ≤ ₹2.5L, 80% for loans ≤ ₹5L, and 75% for larger loans).
- **Benchmark-rate metal valuation** (the lower of previous-day close and 30-day moving average).
- **Tamper-evident, hash-chained audit trail** (SHA-256 hash linking of every loan, appraisal, and redemption event).
- **Upfront interest deduction and 32-day initial grace period** compounding.
- **Statutory bilingual disclosure statements** in both English and Tamil (தமிழ்), with instant printing support.
- **100% offline-first architecture** with client-side IndexedDB persistence, database export/import, and zero remote server dependencies.

---

## 2. Technology Stack

| Layer | Technology | Purpose |
|---|---|---|
| **Framework** | React 18 + TypeScript | Type-safe declarative UI components |
| **Build Tooling** | Vite 6 | Rapid hot-module reloading and optimized production bundling |
| **Styling** | Tailwind CSS | Modern, high-density dark UI design system |
| **Icons** | Lucide React | Visual cues and status indicators |
| **Storage Engine** | Native IndexedDB (`suba_s1`) | Client-side transactional, indexed document store |
| **Security & Crypto** | Web Cryptography API (`SubtleCrypto`) | Hardware-accelerated SHA-256 event chaining |
| **Localization** | Custom English (`en`) & Tamil (`ta`) dictionary | RBI-compliant bilingual disclosure receipts |

---

## 3. Architecture & File Structure

```text
suba-finance-app/
├── index.html                  # HTML entry point with Tamil-compatible fonts
├── package.json                # Dependencies, scripts (dev, build, preview)
├── tsconfig.json               # TypeScript compiler configuration
├── vite.config.ts              # Vite bundling setup
├── tailwind.config.js          # Tailwind custom color extensions
├── src/
│   ├── main.tsx                # React DOM root bootstrapping
│   ├── App.tsx                 # Root application container, state coordination, routing & modal dispatch
│   ├── types.ts                # Strict TypeScript interfaces for loans, collateral, events, and rates
│   ├── index.css               # Global CSS styles, print media rules, and typography
│   │
│   ├── db/
│   │   └── indexedDB.ts        # Database schema, migration ladder (MIG), and transactional commit helpers
│   │
│   ├── utils/
│   │   ├── rules.ts            # RBI compliance logic, tiered LTV calculations, localization & formatters
│   │   └── crypto.ts           # SHA-256 hashing, event generation (mkEv), and audit verification (verify)
│   │
│   └── components/
│       ├── Navigation.tsx      # Sidebar/Bottom tab bar with status badges
│       ├── NewPledge.tsx       # Loan appraisal form, collateral assessor & atomic commitment
│       ├── Ledger.tsx          # Master loan book, live interest accrual, search, filters & actions
│       ├── Redemption.tsx      # Loan closure, settlement calculation, waivers & collateral release
│       ├── Research.tsx        # Market rates chart, LTV sensitivity analysis & compliance checklists
│       ├── DataManagement.tsx  # JSON backup/restore, audit trail verifier, rates manager & demo seed
│       └── DisclosureModal.tsx # Printable bilingual (English/Tamil) RBI Loan Disclosure Statement
```

---

## 4. Database Engine (`src/db/indexedDB.ts`)

The application uses an IndexedDB database named `suba_s1` governed by a versioned migration ladder (`MIG`):

### Object Stores & Indexes

1. **`customers`** (`keyPath: 'id'`, index: `['name']`)
   - Stores borrower profiles (name, phone, Aadhaar/ID, address).
2. **`loans`** (`keyPath: 'id'`, index: `['status', 'serialNo']`)
   - Stores active and closed loan contracts, principal, APR, dates, and disclosure metadata.
3. **`items`** (`keyPath: 'id'`, index: `['loanId']`)
   - Stores granular itemized collateral entries (description, metal, gross/net weight, purity, valuation).
4. **`events`** (`keyPath: 'id'`, index: `['loanId', 'seq']`)
   - Stores the append-only, cryptographically linked audit blocks.
5. **`rates`** (`keyPath: 'id'`, index: `['date']`)
   - Historical daily closing rates for 24K Gold and 99.9% Silver.
6. **`audits`** (`keyPath: 'id'`)
   - Timestamped compliance checklist snapshots.
7. **`meta`** (`keyPath: 'k'`)
   - System metadata such as `head` (last event sequence and hash), `salt`, and `lastBackup`.

### Transactional Helper: `commit(ops)`
Allows executing atomic updates across multiple stores within a single readwrite transaction:
```typescript
await commit([
  ['loans', newLoan],
  ['items', itemA],
  ['items', itemB],
  ['events', eventRecord],
  ['meta', updatedHeadRecord],
]);
```

---

## 5. Regulatory Rules & Calculations (`src/utils/rules.ts`)

### 1. Tiered LTV Limits
Compliant with RBI guidelines:
- **Tier 1 (≤ ₹2,50,000)**: Maximum LTV is **85%**
- **Tier 2 (≤ ₹5,00,000)**: Maximum LTV is **80%**
- **Tier 3 (> ₹5,00,000)**: Maximum LTV is **75%**

### 2. Collateral Valuation Benchmark (`bench()`)
To prevent over-valuation:
$$\text{Benchmark Rate} = \min(\text{Previous-Day Close}, \text{30-Day Moving Average})$$
The system marks a rate as **fresh** only if it was recorded within $\le 1$ day of the pledge date.

### 3. Maximum Weight Caps per Borrower
- **Gold**: Maximum 1,000 grams of pledged ornaments per borrower.
- **Silver**: Maximum 10,000 grams (10 kg) per borrower.

### 4. Accrued Interest & Grace Period (`LV()`, `months()`)
- **Initial Grace Period**: **32 days** covered by the first month's upfront interest deduction.
- **Subsequent Charges**: Any period exceeding 32 days triggers monthly interest at $\lceil(days - 32) / 30\rceil \times \text{monthly rate}$.

### 5. Formatters
- `inr(n)`: Converts numbers to Indian Currency format (e.g., `₹1,25,000`).
- `pc(n)`: Formats numbers as percentages (e.g., `85.0%`).
- `fd(d)`: Formats dates to `DD MMM YYYY` (Indian Standard).

### 6. Bilingual Localization Dictionary (`T`)
Contains exact legal terminology in English and Tamil for:
- Pledged Ornaments (அடகு வைத்த நகைகள்)
- Loan-to-Value (கடன்-மதிப்பு விகிதம்)
- Upfront Interest (முதல் மாத வட்டி)
- Cash Handed Over (உங்களுக்கு வழங்கப்பட்ட பணம்)
- Signatures of Borrower and Lender (கடன் பெறுபவர் & கடன் வழங்குபவர் கையொப்பம்)

---

## 6. Cryptographic Audit Chain (`src/utils/crypto.ts`)

Every transaction (pledge creation, interest revision, loan redemption) creates an immutable event in the `events` store.

### Event Construction (`mkEv`)
```typescript
ev.seq  = head.seq + 1;
ev.prev = head.hash;
ev.hash = await sha(ev.prev + JSON.stringify([ev.id, loanId, type, ev.ts, ev.seq, data]));
```

### Chain Verification (`verify()`)
Traverses all records sequentially from sequence 1 to head:
- Confirms that `current.prev === previous.hash`.
- Re-calculates SHA-256 of the payload to confirm that no record has been altered.
- Returns `{ n: totalEvents, bad: tamperedEvents }`.

---

## 7. Modular Components Overview

### 1. `NewPledge.tsx` (Loan Origination)
- **Borrower Onboarding / Selection**: Pick an existing customer or create a new profile with phone and Aadhaar.
- **Multi-Item Collateral Grid**: Add multiple gold/silver ornaments with description, gross weight, net weight, and purity selection (24K, 22K, 20K, 18K for gold; Fine, Sterling, 80%, 70% for silver).
- **Live Valuation & Real-time LTV Guardrail**: Displays market valuation against the RBI benchmark, calculates the maximum permissible loan, and warns if proposed principal exceeds the tier cap.
- **Upfront Interest Deduction**: Shows the exact net cash disbursed after withholding the first 32 days of interest.
- **Atomic Save**: Creates the loan, collateral items, audit event, and updates the chain head in one step.

### 2. `Ledger.tsx` (Portfolio & Loan Book)
- **Metrics Bar**: Total Active Loans, Outstanding Principal, Total Collateral Value, and Portfolio Average LTV.
- **Filter & Search**: Filter by status (`Active` or `Redeemed`) and search by serial number or borrower name.
- **Dynamic Status**: Live computation of days elapsed, interest months due, current dues, and real-time LTV risk indicator.
- **Quick Actions**: One-click opening of the Bilingual Disclosure Statement and direct jump to Redemption.

### 3. `Redemption.tsx` (Loan Settlement & Closure)
- **Settlement Calculator**: Computes principal balance, accrued interest, and allows entering an interest concession/waiver.
- **Reconciliation Summary**: Shows net payable, payment date, and repayment receipt notes.
- **Collateral Release Confirmation**: Prompts physical handover verification of all pledged ornaments.
- **Tamper-Evident Closure**: Commits `Redeemed` status to the loan and appends a `REDEMPTION` event to the cryptographic chain.

### 4. `Research.tsx` (Analytics & Regulatory Auditing)
- **Benchmark Valuation Tracker**: Visual inspection of historical gold/silver daily rates and 30-day moving averages.
- **Price Stress-Testing Simulator**: Slide metal prices down by -10%, -20%, or -30% to preview portfolio LTV spikes and margin calls.
- **RBI Compliance Rubric**: Live pass/fail checklist evaluating all loans against the 6 statutory tests:
  1. LTV within tier cap
  2. Benchmark rate $\le 1$ day old
  3. Weight & purity documented per item
  4. Per-borrower ornament weight cap respected
  5. Written disclosure issued
  6. Disclosure issued in regional language (Tamil)

### 5. `DataManagement.tsx` (Data Lifecycle & Integrity)
- **Backup & Restore**: Download full database as a single JSON file or restore from a previous backup.
- **Audit Verifier UI**: Triggers `verify()` across all IndexedDB events and displays cryptographic validity status.
- **Daily Rate Updater**: Interface to manually input today's Gold and Silver market prices.
- **Demo Seed Generator**: Instant 1-click generation of realistic sample customers, loans, and rate histories.
- **Factory Reset**: Clean wipe of IndexedDB stores.

### 6. `DisclosureModal.tsx` (Statutory Disclosure)
- **RBI Schedule I Format**: Compliant layout displaying loan amount, itemized ornaments, purity, benchmark rates, APR, grace period terms, and net cash.
- **One-Click Language Switch**: Instantly toggle between English and Tamil.
- **Print Optimizer**: Dedicated `@media print` CSS stylesheet formatting the document as a clean physical receipt with dual signature sections.

---

## 8. Development & Build Commands

All standard Node.js / Vite scripts are supported:

```bash
# Install dependencies
npm install

# Start local development server (with HMR)
npm run dev

# Run TypeScript typecheck and build production bundle
npm run build

# Preview production build locally
npm run preview
```

---

## 9. Compliance Summary Matrix

| RBI Mandate | Implementation in Suba Finance | Verified In |
|---|---|---|
| **Tiered LTV Caps** | 85% ($\le$2.5L), 80% ($\le$5L), 75% (>5L) | `src/utils/rules.ts` (`CFG.tiers`, `cap()`) |
| **Metal Price Benchmark** | $\min(\text{Prev Close}, \text{30-Day Moving Average})$ | `src/utils/rules.ts` (`bench()`) |
| **Borrower Weight Caps** | Max 1,000g Gold, 10,000g Silver | `src/utils/rules.ts` (`CFG.capG`, `CFG.capS`) |
| **32-Day Grace Period** | Upfront 1-month interest covers initial 32 days | `src/utils/rules.ts` (`months()`, `ch()`) |
| **Bilingual Disclosure** | English & Tamil printable disclosure statement | `src/components/DisclosureModal.tsx` |
| **Audit Log Integrity** | SHA-256 hash-chained sequential events | `src/utils/crypto.ts` (`mkEv()`, `verify()`) |
| **Offline Privacy** | Zero external API calls; stored in local IndexedDB | `src/db/indexedDB.ts` |
