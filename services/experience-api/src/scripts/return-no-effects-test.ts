import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * Proves the return path has no commerce or ERP effect by inspecting its code, not by observing
 * silence. A return store/route must not import Medusa or Tryton clients, call fetch/axios, or emit
 * a money/stock mutation.
 */

const files = [
  fileURLToPath(new URL("../store/return-store.ts", import.meta.url)),
  fileURLToPath(new URL("../returns/eligibility.ts", import.meta.url)),
];
for (const file of files) {
  const source = readFileSync(file, "utf8");
  assert.ok(!/from\s+["'].*medusa/i.test(source), `${file} must not import Medusa`);
  assert.ok(!/from\s+["'].*tryton/i.test(source), `${file} must not import Tryton`);
  assert.ok(!/\bfetch\s*\(/.test(source), `${file} must not call fetch`);
  assert.ok(!/\baxios\b/.test(source), `${file} must not use axios`);
  assert.ok(!/refund\(|payment|stockMove|stock_move|inventory/i.test(source), `${file} must not mutate money or stock`);
}
const storeSource = readFileSync(files[0], "utf8");
assert.ok(/money_effect:\s*"none"/.test(storeSource));
assert.ok(/stock_effect:\s*"none"/.test(storeSource));
console.log("return-no-effects-test: pass");
