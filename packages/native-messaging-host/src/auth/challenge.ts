import * as crypto from "node:crypto";

// HMAC-SHA-256 challenge-response (doc 03 §4). The host only ever stores tokenHash =
// SHA-256(token) (doc 04 §8) — never the raw token — so the MAC is keyed on tokenHash rather
// than the raw token itself: `HMAC_SHA256(key=tokenHash, nonce + "|" + endpointName)`. This is
// the only construction that lets the host verify a session using solely what it's allowed to
// persist. Binding the endpoint name into the MAC prevents replaying a captured response
// against a different socket/pipe.

export function generateNonce(): string {
  return crypto.randomBytes(32).toString("hex");
}

export function computeMac(tokenHash: string, nonce: string, endpointName: string): string {
  return crypto.createHmac("sha256", tokenHash).update(`${nonce}|${endpointName}`).digest("hex");
}

export function verifyMac(tokenHash: string, nonce: string, endpointName: string, candidateMac: string): boolean {
  const expected = computeMac(tokenHash, nonce, endpointName);
  const expectedBuf = Buffer.from(expected, "hex");
  let candidateBuf: Buffer;
  try {
    candidateBuf = Buffer.from(candidateMac, "hex");
  } catch {
    return false;
  }
  if (expectedBuf.length !== candidateBuf.length) return false;
  return crypto.timingSafeEqual(expectedBuf, candidateBuf);
}
