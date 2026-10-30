/**
 * Validation and CSV/paste parsing for seller delivery rates.
 *
 * A rate is one exact (seller_id, 6-digit pincode) row. The API accepts money
 * either as integer minor units (`flat_fee_minor`) or as a rupee amount
 * (`flat_fee_rupees` / `fee`) and always stores minor units.
 */

export type ParsedRate = {
  pincode: string;
  flat_fee_minor: number;
  active: boolean;
};

export type BulkLineError = { line: number; value: string; message: string };

export type BulkParseResult = {
  rows: ParsedRate[];
  errors: BulkLineError[];
  duplicates: number;
};

export const MAX_BULK_ROWS = 5000;

/** Normalises user input to exactly six digits, or returns null. */
export function normalizePincode(value: unknown): string | null {
  const digits = String(value ?? "").replace(/\D/g, "");
  if (digits.length !== 6) return null;
  return digits;
}

/** Accepts integer paise or a rupee amount with up to two decimals. */
export function normalizeFeeMinor(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0) return null;
  const minor = Math.round(amount * 100);
  if (!Number.isSafeInteger(minor)) return null;
  return minor;
}

export function parseBoolean(value: unknown, fallback = true): boolean {
  if (value === null || value === undefined || value === "") return fallback;
  if (typeof value === "boolean") return value;
  const text = String(value).trim().toLowerCase();
  if (["true", "1", "yes", "y", "active"].includes(text)) return true;
  if (["false", "0", "no", "n", "inactive"].includes(text)) return false;
  return fallback;
}

/**
 * Parses a pasted block or CSV.
 *
 * Accepted line shapes (comma, semicolon or tab separated):
 *   pincode,fee
 *   pincode,fee,active
 * A header line containing "pincode" is skipped. Blank lines and `#` comments
 * are ignored. The fee is read in rupees.
 */
export function parseBulkRates(text: string): BulkParseResult {
  const rows: ParsedRate[] = [];
  const errors: BulkLineError[] = [];
  const seen = new Set<string>();
  let duplicates = 0;

  const lines = String(text ?? "").split(/\r?\n/);
  lines.forEach((raw, index) => {
    const lineNumber = index + 1;
    const line = raw.trim();
    if (!line || line.startsWith("#")) return;
    if (index === 0 && /pincode/i.test(line) && /fee|rate|amount|charge/i.test(line)) {
      return;
    }

    const cells = line
      .split(/[,;\t]/)
      .map((cell) => cell.trim().replace(/^"(.*)"$/, "$1"));
    if (cells.length < 2) {
      errors.push({ line: lineNumber, value: line, message: "Expected pincode,fee." });
      return;
    }

    const pincode = normalizePincode(cells[0]);
    if (!pincode) {
      errors.push({ line: lineNumber, value: line, message: "Pincode must be six digits." });
      return;
    }
    const fee = normalizeFeeMinor(cells[1]);
    if (fee === null) {
      errors.push({ line: lineNumber, value: line, message: "Fee must be zero or more." });
      return;
    }

    if (seen.has(pincode)) {
      duplicates += 1;
      const existing = rows.find((row) => row.pincode === pincode);
      if (existing) {
        existing.flat_fee_minor = fee;
        existing.active = parseBoolean(cells[2], true);
      }
      return;
    }
    seen.add(pincode);
    rows.push({ pincode, flat_fee_minor: fee, active: parseBoolean(cells[2], true) });
  });

  return { rows, errors, duplicates };
}

/** Caps a parsed batch before it reaches the database. */
export function assertBulkSize(rows: ParsedRate[], errors: BulkLineError[]): string | null {
  if (rows.length === 0 && errors.length === 0) {
    return "No rate rows were found.";
  }
  if (rows.length > MAX_BULK_ROWS) {
    return `Too many rows (${rows.length}). Split the file into batches of ${MAX_BULK_ROWS}.`;
  }
  return null;
}
