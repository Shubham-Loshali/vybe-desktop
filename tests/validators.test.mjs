import { test } from "node:test";
import assert from "node:assert/strict";
import {
  availabilityState,
  displayNameProblem,
  normalizeDisplayName,
  normalizeUsername,
  usernameProblem,
  passwordProblem,
  usernameTypable,
} from "../.test-build/account-validators.mjs";

test("normalizeUsername lowercases and trims", () => {
  assert.equal(normalizeUsername("  Vybe21 "), "vybe21");
});

test("usernameTypable keeps legal characters and strips the rest as the user types", () => {
  assert.equal(usernameTypable("vy_be.21"), "vy_be.21");
  assert.equal(usernameTypable("@vybe 07!"), "@vybe07");
  assert.equal(usernameTypable("vybe@_07"), "vybe@_07");
  assert.equal(usernameTypable("vybe 21!"), "vybe21");
  assert.equal(usernameTypable("x".repeat(90) + "_"), "x".repeat(80));
});

test("valid usernames and emails pass", () => {
  for (const name of ["vybe", "Vybe21", "vybe2026", "abc", "a".repeat(20), "user@example.com", "user.name+tag-1@vybe.org"]) {
    assert.equal(usernameProblem(name), null, name);
  }
});

test("underscores, dots, hyphens and @ are accepted, in any position", () => {
  for (const name of ["vybe_07", "@vybe", "vybe@", "vybe_07@", "v@y_b_e", "___", "@@_", "vybe.21", "vybe-21"]) {
    assert.equal(usernameProblem(name), null, name);
  }
});

test("spaces and invalid symbols are still rejected", () => {
  for (const name of ["vybe 21", "vybeé", "vybe🎉", "vybe/21"]) {
    assert.notEqual(usernameProblem(name), null, name);
  }
});

test("length bounds enforced", () => {
  assert.notEqual(usernameProblem("ab"), null); // too short
  assert.notEqual(usernameProblem("a".repeat(81)), null); // too long
});

test("uniqueness is case-insensitive: same normalized form", () => {
  assert.equal(normalizeUsername("Vybe21"), normalizeUsername("vybe21"));
});

test("password minimum length", () => {
  assert.equal(passwordProblem("longenough1"), null);
  assert.notEqual(passwordProblem("short"), null);
});

test("failed availability lookups read as unknown, never taken (H3)", () => {
  assert.equal(availabilityState(true), "free");
  assert.equal(availabilityState(false), "taken");
  // Offline / network error: the form must stay submittable, not show "Taken".
  assert.equal(availabilityState(null), "unknown");
  assert.equal(availabilityState(undefined), "unknown");
});

test("a display name is tidied: spaces collapsed and trimmed, line breaks and control characters gone", () => {
  assert.equal(normalizeDisplayName("  Alex   Smith  "), "Alex Smith");
  assert.equal(normalizeDisplayName("Al\tex\nSmith\r\n"), "Al ex Smith");
  assert.equal(normalizeDisplayName("A\u0007B\u0085C"), "A B C");
  assert.equal(normalizeDisplayName("\u00a0Alex\u2028"), "Alex");
  assert.equal(normalizeDisplayName("🎧 Alex"), "🎧 Alex");
  assert.equal(normalizeDisplayName("Ana María"), "Ana María");
});

test("a display name is 1-30 characters, counted the way the database counts them", () => {
  assert.equal(displayNameProblem("R"), null);
  assert.equal(displayNameProblem("a".repeat(30)), null);
  assert.equal(displayNameProblem(`${"x".repeat(29)}🎧`), null, "an emoji is one character");
  assert.equal(displayNameProblem("テスト・ユーザー"), null);
  assert.equal(displayNameProblem("  Alex  "), null, "checked after tidying");
  assert.match(displayNameProblem(""), /Enter a display name/);
  assert.match(displayNameProblem(" \n\t "), /Enter a display name/);
  assert.match(displayNameProblem("a".repeat(31)), /30 characters/);
});
