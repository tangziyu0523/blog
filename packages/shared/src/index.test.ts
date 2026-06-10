import { test } from "node:test";
import assert from "node:assert/strict";
import { ok, fail } from "./index.ts";

test("ok wraps data with null error", () => {
  const res = ok({ id: 1 });
  assert.deepEqual(res, { data: { id: 1 }, error: null });
});

test("fail wraps error with null data", () => {
  const res = fail("NOT_FOUND", "post not found", "trace-1");
  assert.equal(res.data, null);
  assert.equal(res.error?.code, "NOT_FOUND");
});
