import { test } from "node:test";
import assert from "node:assert/strict";
import { syntheticEmail } from "../.test-build/config.mjs";

test("usernames without @ map exactly as they always have", () => {
  // Every pre-charset account relies on this exact form to sign in.
  assert.equal(syntheticEmail("vybe21"), "vybe21@users.vybe.local");
  assert.equal(syntheticEmail("Vybe"), "vybe@users.vybe.local");
});

test("underscores pass through untouched", () => {
  assert.equal(syntheticEmail("vybe_07"), "vybe_07@users.vybe.local");
});

test("@ maps to -- so the auth provider's email validation accepts it", () => {
  assert.equal(syntheticEmail("@vybe"), "--vybe@users.vybe.local");
  assert.equal(syntheticEmail("vybe_07@"), "vybe_07--@users.vybe.local");
  assert.equal(syntheticEmail("v@y"), "v--y@users.vybe.local");
});

test("the mapping is injective: distinct usernames never share an auth email", () => {
  // '-' is not a legal username character, so '--' can only come from an '@'.
  const names = ["vybe", "v_ybe", "vybe@", "@vybe", "v@y", "v_y", "vy_", "@vy", "v__y", "v@@y"];
  const emails = new Set(names.map(syntheticEmail));
  assert.equal(emails.size, names.length);
});
