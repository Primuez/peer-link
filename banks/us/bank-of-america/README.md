# Bank of America — experimental

Scope: Bank of America web **outgoing USD Zelle payments**, using the activity detail response. Input is the response envelope with `data.activities` and optional `data.accounts`, plus an explicit transaction ID. The pure function `interpretBankOfAmerica` is in `transformer.js` (checked by TypeScript). `matchPayment` compares its output against exact payer, payee, amount and currency claims.

## Semantics

- Payer: `sender.accountId` identifies the debiting account. If `data.accounts` is present in the envelope, the ID must resolve to exactly one account. This is a Bank of America account reference, not a verified legal identity. Never use a display name to fill the gap.
- Payee: `recipient.token` must be a valid email address or E.164 telephone number registered with Zelle. Untrusted contact names and memo fields do not establish identity.
- Amount: negative debit in major USD units; converted to positive minor units (cents) without rounding. Reject excessive precision and unsupported range. USD follows the domestic Zelle surface; explicit conflicting currency fails.
- Status: only `COMPLETED` or `DELIVERED`, with no active holds or dispute state. These observed values do not prove recipient credit or legal irreversibility.
- Time: UTC `postedAt`, not scheduled date or estimated arrival.
- ID: the selected Bank of America activity ID, not a cross-bank canonical payment ID. Memos and confirmation codes are untrusted and do not establish uniqueness or identity.

ACH, domestic/international wires, debit cards, checks, incoming Zelle transfers, pending/scheduled transfers, and recipient credit confirmation are unsupported. Missing or ambiguous facts return insufficient evidence.

## Local acquisition

1. Sign into your authorized Bank of America account in Chrome using standard authentication and MFA.
2. Navigate to Account Activity or Send Money with Zelle > Activity and locate an existing outgoing Zelle payment. Opening transaction details is read-only. Do not initiate or resend payments.
3. Using your browser developer tools or authorized network inspection capability, view the read-only JSON response for the selected activity item or activity feed. Do not copy session cookies, CSRF tokens, or full HAR recordings into fixtures.
4. Run the pure parser locally against the response and selected transaction ID.
5. Publish only synthetic or sanitized fixtures and a revision-specific report following the repository's privacy and contribution rules.

The history request observed on 2026-10-02 is a read-only **GET** request made by the Bank of America Online Banking web interface when inspecting transaction activity details (e.g. `api/v1/accounts/{accountId}/activities` or the activity detail panel JSON response).

### Observed response shape

The response envelope contains an enclosing `data` object with `activities` and optional `accounts`. Field names and types observed on the completed outgoing Zelle surface (documented using invented values):

```json
{
  "data": {
    "activities": [
      {
        "id": "boa-zelle-synthetic-001",
        "type": "ZELLE_DEBIT",
        "status": "COMPLETED",
        "amount": -75.50,
        "currency": "USD",
        "postedAt": "2026-02-14T18:45:00.000Z",
        "sender": {
          "accountId": "boa-acct-checking-4921",
          "accountMask": "4921"
        },
        "recipient": {
          "token": "alice@example.com",
          "tokenType": "EMAIL",
          "name": "Synthetic Alice"
        },
        "details": {
          "paymentMethod": "Zelle",
          "confirmationNumber": "BOA-ZEL-CONF-987654",
          "memo": "Dinner synthetic",
          "hold": false
        }
      }
    ],
    "accounts": [
      {
        "id": "boa-acct-checking-4921",
        "type": "CHECKING",
        "name": "Synthetic Advantage Banking"
      }
    ]
  }
}
```

Field dictionary:
- `data.activities[]` (array, required): activity records. Exactly one entry must match the selected `transactionId`.
- `id` (string, required): unique activity row identifier.
- `type` (string, required): activity type. Only outgoing `"ZELLE_DEBIT"` is supported; `"ZELLE_CREDIT"` returns unsupported.
- `status` (string, required): lifecycle status. Must equal `"COMPLETED"`.
- `amount` (number, required): negative finite floating-point debit in major USD units with at most two decimal digits.
- `currency` (string, optional): ISO currency code. Must be `"USD"` if present.
- `postedAt` (string, required): ISO 8601 UTC timestamp ending in `Z`.
- `sender.accountId` (string, required): internal debiting account ID.
- `recipient.token` (string, required): unmasked recipient identifier. Must be a full valid email address or E.164 phone (`+...`). Masked tokens (containing `*`, `•`, or `x{3,}`) are rejected.
- `recipient.tokenType` (string, optional): `"EMAIL"` or `"PHONE"`.
- `details.paymentMethod` (string, required if type is not ZELLE_DEBIT): must equal `"Zelle"`.
- `details.hold` / `hold` (boolean, optional): if true, rejected as active hold.
- `activeHolds` / `details.activeHolds` (array, optional): must be absent or empty.
- `data.accounts[]` (array, optional): enrolled accounts envelope. When present, `sender.accountId` must match exactly one account.

## Validation

Synthetic baseline tests cover status, debit precision, recipient token schemes (email and E.164 phone), holds, disputes, timestamps, unsupported methods, duplicates, and instruction-like memos.
