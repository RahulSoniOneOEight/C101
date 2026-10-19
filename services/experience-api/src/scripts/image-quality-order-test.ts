import assert from "node:assert/strict";
import {
  imageQualityScore,
  orderByImageQuality,
} from "../catalogue/image-quality-order.js";
import { chg049ImageQualityScores } from "../catalogue/image-quality-scores.generated.js";

const high = "prod_01M59JS4A6QTH32AXVW9P2D3A3";
const low = "prod_01M59JHKBZ41EJTYW3X6MCXZC6";

assert.equal(Object.keys(chg049ImageQualityScores).length, 233);
assert.ok(imageQualityScore(high) > imageQualityScore(low));
assert.deepEqual(
  orderByImageQuality([
    { id: low, name: "low" },
    { id: "unknown-a", name: "unknown-a" },
    { id: high, name: "high" },
    { id: "unknown-b", name: "unknown-b" },
  ]).map((item) => item.name),
  ["high", "low", "unknown-a", "unknown-b"],
);

assert.deepEqual(
  orderByImageQuality([
    { id: "unknown-a" },
    { id: "unknown-b" },
  ]).map((item) => item.id),
  ["unknown-a", "unknown-b"],
  "equal/unknown scores preserve source order",
);

console.log("image-quality-order-test: PASS");
