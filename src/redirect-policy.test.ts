import assert from "node:assert/strict";
import { test } from "node:test";
import { isLocalhostUri, validateAppRedirects } from "./redirect-policy.ts";

test("localhost callbacks require an explicit testing opt-in", () => {
  for (const uri of ["http://localhost:5173/callback", "http://127.0.0.1:3000/callback", "http://[::1]:3000/callback"]) {
    assert.throws(() => validateAppRedirects([uri], false), /testing/i);
    assert.doesNotThrow(() => validateAppRedirects([uri], true));
    assert.equal(isLocalhostUri(uri), true);
  }
  assert.doesNotThrow(() => validateAppRedirects(["https://app.example.com/callback"], false));
});

test("testing opt-in never permits remote HTTP or unsafe callback URLs", () => {
  for (const uri of ["http://example.com/callback", "http://localhost.example.com/callback", "http://localhost@evil.example/callback", "not a URL", "http://localhost:3000/callback#fragment", "http://user:pass@localhost:3000/callback"]) {
    assert.throws(() => validateAppRedirects([uri], true));
  }
  assert.equal(isLocalhostUri("http://localhost.example.com/callback"), false);
  assert.equal(isLocalhostUri("invalid"), false);
});

test("native app schemes are left to the provider's existing validation", () => {
  assert.doesNotThrow(() => validateAppRedirects(["com.example.app:/callback"], false));
});
