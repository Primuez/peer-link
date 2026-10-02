# Easypaisa — experimental

## Scope

Scope: Easypaisa mobile **outgoing Easypaisa-to-Easypaisa mobile account transfers**, using the mobile transaction history surface. Input is the transaction history response envelope containing `account` and `transactions` arrays, plus an explicit transaction ID (TRX ID). The pure function `interpretEasypaisa` is in `transformer.js`.

## Semantics

- Payer: `account.accountNumber` (or `account.id` / `account.msisdn`) identifies the sender's unmasked Pakistani mobile account number in domestic (`03XXXXXXXXX`) or international (`923XXXXXXXXX` / `+923XXXXXXXXX`) MSISDN format. Display names and caller-supplied labels are ignored; masked accounts abstain with `insufficient_evidence`.
- Payee: `transaction.receiver.accountNumber` (or `counterparty.msisdn`) is the recipient's full unmasked Pakistani mobile account number (`pk-msisdn`). Masked mobile numbers (e.g. `0312****543`) and contact names alone are rejected as insufficient evidence.
- Amount: Outgoing debit in PKR. Decimal string or finite number with up to 2 decimal places (PKR paisas). Converted to minor units without floating-point arithmetic. Excessive decimal precision or non-positive amounts fail.
- Currency: `PKR` (Pakistani Rupee), with ISO 4217 minor unit exponent 2. Conflicting currencies fail.
- Status: Only `COMPLETED` (or `completed`), indicating bank-reported execution. Pending, processing, failed, reversed, and cancelled states abstain with `insufficient_evidence`.
- Time: Explicit UTC ISO-8601 timestamp ending in `Z` (`timestamp`, `dateTime`, or `bookedAt`). Timestamps without timezone or with non-UTC offsets abstain.
- ID: Easypaisa transaction ID (`id` or `trxId`), unique to the transaction record. Memos and display text are untrusted.

Unsupported: IBFT / Raast inter-bank transfers, incoming transfers, bill payments, mobile load / top-ups, cash deposits, and debit cards. Missing or ambiguous identifiers return `insufficient_evidence`.

## Local acquisition

1. The account owner signs into the official Easypaisa mobile application using their registered mobile number and PIN / biometric authentication.
2. Navigate to Transaction History / Statement and locate an existing outgoing Easypaisa-to-Easypaisa mobile transfer. Opening transaction details is read-only; never create or replay payments.
3. Using an authorized local proxy or inspection tool, save the transaction history JSON response into `.local/easypaisa-response.json`. Do not export authorization tokens, cookies, or personal banking statements.
4. Run `npm run try:bank -- pk/easypaisa .local/easypaisa-response.json <trxId>` and verify that the redacted summary matches the transaction details shown in the mobile app.
5. Publish only synthetic or sanitized fixtures and a version-pinned live report.

## Validation

Synthetic unit tests in `transformer.test.ts` verify:
- Accurate extraction of payer, payee, amount in minor units, currency, status, and UTC timestamp.
- Strict rejection of missing, masked, or malformed payer and payee mobile numbers.
- Fail-closed handling for nonfinal statuses (`PENDING`, `PROCESSING`, `FAILED`, `REVERSED`).
- Rejection of unsupported transaction types (IBFT/Raast, bill payments, incoming transfers).
- Protection against adversarial instruction-like text injected into memos or recipient titles.
- Contract compliance in `banks/adapter-contract.test.ts`.
