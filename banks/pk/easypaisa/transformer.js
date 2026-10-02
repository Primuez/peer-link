/**
 * Pure, read-only Easypaisa transaction interpretation. No login, network, clock, randomness or logging.
 * @param {unknown} input The response envelope from the Easypaisa mobile transaction history surface.
 * @param {string} transactionId The explicitly selected transaction ID (TRX ID).
 * @returns {import('../../../lib/types.js').Interpretation}
 */
export function interpretEasypaisa(input, transactionId) {
  const CURRENCY = "PKR";
  const EXPONENT = 2;
  const fail = (/** @type {string} */ reason) =>
    /** @type {const} */ ({ outcome: "insufficient_evidence", reason });
  const object = (/** @type {unknown} */ v) =>
    v !== null && typeof v === "object" && !Array.isArray(v)
      ? /** @type {Record<string, unknown>} */ (v)
      : null;
  const text = (/** @type {unknown} */ v) => typeof v === "string" && v.trim().length > 0;

  const root = object(input);
  const data = object(root?.data) ?? root;
  const account = object(data?.account);
  if (!root || !account || !Array.isArray(data?.transactions))
    return fail("Expected account and transactions array");

  if (!text(transactionId)) return fail("A transaction ID is required");

  const rows = data.transactions.filter((row) => {
    const r = object(row);
    return r?.id === transactionId || r?.trxId === transactionId;
  });
  if (rows.length !== 1)
    return fail("Selected transaction must occur exactly once in transactions");

  const row = object(rows[0]);
  if (!row) return fail("Invalid transaction");

  const type = typeof row.type === "string" ? row.type : "";
  if (
    type !== "easypaisa_transfer" &&
    type !== "domesticTransfer" &&
    type !== "easypaisa_to_easypaisa"
  )
    return {
      outcome: "unsupported",
      reason: "Only outgoing Easypaisa-to-Easypaisa mobile transfers are supported",
    };

  if (row.direction === "credit" || row.direction === "incoming")
    return { outcome: "unsupported", reason: "Only outgoing transfers are supported" };

  if (row.direction !== "debit" && row.direction !== "outgoing")
    return fail("Expected debit or outgoing direction");

  if (row.status !== "COMPLETED" && row.status !== "completed")
    return fail("Transaction is not bank-reported completed");

  if (row.currency !== undefined && row.currency !== CURRENCY)
    return fail("Missing or conflicting currency");

  const rawAmount =
    typeof row.amount === "number" && Number.isFinite(row.amount)
      ? String(row.amount)
      : typeof row.amount === "string"
        ? row.amount
        : null;

  if (!rawAmount || !/^(0|[1-9]\d*)(\.\d{1,2})?$/.test(rawAmount))
    return fail("Amount must be a decimal string with at most two decimals");

  const [whole, fraction = ""] = rawAmount.split(".");
  const minor = BigInt(whole) * 100n + BigInt(fraction.padEnd(EXPONENT, "0"));
  if (minor <= 0n || minor > BigInt(Number.MAX_SAFE_INTEGER))
    return fail("Amount outside supported range");

  const ts =
    typeof row.timestamp === "string"
      ? row.timestamp
      : typeof row.dateTime === "string"
        ? row.dateTime
        : row.bookedAt;

  if (typeof ts !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?Z$/.test(ts))
    return fail("Expected an explicit UTC timestamp");

  const time = Date.parse(ts);
  if (!Number.isFinite(time) || new Date(time).toISOString().slice(0, 19) !== ts.slice(0, 19))
    return fail("Invalid timestamp");

  const payerRaw =
    typeof account.accountNumber === "string"
      ? account.accountNumber
      : typeof account.id === "string"
        ? account.id
        : account.msisdn;

  if (typeof payerRaw !== "string" || !/^(?:\+?923\d{9}|03\d{9})$/.test(payerRaw.trim()))
    return fail("Full unmasked payer account identifier is required");

  const counterparty = object(row.receiver) ?? object(row.counterparty);
  const payeeRaw =
    counterparty && typeof counterparty.accountNumber === "string"
      ? counterparty.accountNumber
      : counterparty && typeof counterparty.msisdn === "string"
        ? counterparty.msisdn
        : counterparty?.mobileNumber;

  if (typeof payeeRaw !== "string" || !/^(?:\+?923\d{9}|03\d{9})$/.test(payeeRaw.trim()))
    return fail("Full unmasked recipient mobile identifier is required");

  const statusPreserved = typeof row.status === "string" ? row.status : "COMPLETED";

  return {
    outcome: "supported",
    payment: {
      schemaVersion: "2",
      provider: "pk/easypaisa",
      transactionId,
      payer: {
        id: payerRaw.trim(),
        scheme: "pk-msisdn",
        provenance: "account.accountNumber",
      },
      payee: {
        id: payeeRaw.trim(),
        scheme: "pk-msisdn",
        provenance: "transaction.receiver.accountNumber",
      },
      amountMinor: minor.toString(),
      currency: CURRENCY,
      currencyExponent: EXPONENT,
      direction: "outgoing",
      status: statusPreserved,
      timestamp: ts,
      timestampMeaning:
        typeof row.timestamp === "string"
          ? "timestamp"
          : typeof row.dateTime === "string"
            ? "dateTime"
            : "bookedAt",
      sourceAuthenticated: false,
      limitations: [
        "Input authenticity is not established by this parser.",
        "COMPLETED is the sender-bank status, not proof of recipient credit or irreversible settlement.",
        "Payer identity is an Easypaisa mobile account reference, not a verified legal person.",
        "Payee identity is an Easypaisa mobile number (MSISDN), not a verified legal person or bank routing.",
        "Transaction ID is local to Easypaisa; no cross-bank deduplication is claimed.",
        "PKR is the sole currency supported on the Easypaisa domestic mobile transfer surface.",
      ],
    },
  };
}
