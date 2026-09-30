import {
  createMouseEvent,
  CustomEventClone,
  pageAddEventListener,
  pageDispatchEvent,
  pageRemoveEventListener,
} from "@Packages/message/common";

const channelId = process.env.SC_RANDOM_KEY!;

/**
 * Number of independent realms expected to resolve the same token.
 *
 * One token generation is shared across:
 *   - scripting.js
 *   - content.js
 *   - inject.js
 *
 * The realm that handles the first request becomes the token responder.
 * Its active token is served exactly this many times before being rotated.
 */
const REALM_PARTICIPANT_COUNT = 3;

/**
 * Remaining claims for the current active token.
 *
 * This counter is meaningful only in the realm that becomes the active
 * responder. Other realms unregister their request handlers after discovering
 * that an earlier realm already owns the responder role.
 */
let remainingTokenClaims = REALM_PARTICIPANT_COUNT;

/**
 * Private synchronization event used to elect a token responder and distribute
 * the same realm token to all participants in this channel.
 */
const REALM_TOKEN_REQUEST_EVENT = `REALM_TOKEN_REQUEST_${channelId}`;

/**
 * Generates a non-zero probabilistic realm token.
 *
 * Each factor is produced by:
 *
 *   (Math.random() * 2^32) | 1
 *
 * which coerces the random value to a signed int32 and forces its low bit,
 * yielding one of 2^31 non-zero odd int32 values (~31 bits per factor).
 * The mathematical product therefore contains at most ~62 bits of source
 * entropy before accounting for multiplication collisions.
 *
 * The product may exceed Number.MAX_SAFE_INTEGER. In that case IEEE-754
 * binary64 rounds the mathematical integer product, so the returned Number
 * remains integer-valued but may have lost low-order bits. Consequently the
 * stored token is not guaranteed to remain mathematically odd.
 *
 * This token is intended for lightweight probabilistic realm correlation.
 * It is neither cryptographically secure nor collision-free because its
 * entropy originates from Math.random() and multiplication is many-to-one.
 *
 * @returns A finite, non-zero, integer-valued Number used as the realm token.
 */
const createRealmToken = () => ((Math.random() * 0x100000000) | 1) * ((Math.random() * 0x100000000) | 1);

/**
 * Token currently served by this realm if it becomes the active responder.
 * Rotated after REALM_PARTICIPANT_COUNT successful claims.
 */
let activeRealmToken = createRealmToken();

/**
 * Token resolved for this realm.
 *
 * Once set, subsequent calls to resolveRealmToken() return this cached value
 * and do not participate in token negotiation again.
 */
let resolvedRealmToken: number;

/**
 * Set when this realm handles its own request.
 *
 * This distinguishes the elected responder from later participants. A realm
 * whose request is answered by an existing responder removes the temporary
 * listener it just installed, leaving exactly the earlier responder active.
 */
let requestHandledLocally = false;

/**
 * Resolves the token shared by all participating realms.
 *
 * The protocol is a synchronous first-listener-wins election:
 *
 * 1. Each realm installs a handler for REALM_TOKEN_REQUEST_EVENT.
 * 2. It dispatches a request carrying a private response EventTarget in
 *    MouseEvent.relatedTarget.
 * 3. The earliest surviving handler calls stopImmediatePropagation(), making
 *    itself the sole responder for that request.
 * 4. The responder synchronously dispatches the token to the private target.
 * 5. If another realm handled the request, this realm removes its temporary
 *    handler. The elected responder keeps its handler for subsequent claims.
 * 6. After REALM_PARTICIPANT_COUNT claims, the responder rotates its active
 *    token for the next group.
 *
 * This relies on DOM event dispatch being synchronous: the response handler
 * must run before pageDispatchEvent() returns.
 *
 * The function is normally called once during initialization. Its listener
 * function reference must remain stable so it can be removed by reference.
 *
 * @returns The non-zero token shared by the current realm group.
 */
const resolveRealmToken = () => {
  if (resolvedRealmToken) return resolvedRealmToken;

  const handleTokenRequest = (event: MouseEvent) => {
    // Capture before rotation so the final participant receives the same token.
    const token = activeRealmToken;

    if (--remainingTokenClaims === 0) {
      activeRealmToken = createRealmToken();
      remainingTokenClaims = REALM_PARTICIPANT_COUNT;
    }

    // Exactly one realm may answer a given request.
    event.stopImmediatePropagation();

    // Reply synchronously through the requester's private response target.
    event.relatedTarget?.dispatchEvent(
      new CustomEventClone(REALM_TOKEN_REQUEST_EVENT, {
        detail: token,
      })
    );

    requestHandledLocally = true;
  };

  pageAddEventListener(REALM_TOKEN_REQUEST_EVENT, handleTokenRequest as EventListener);

  const handleTokenResponse = (event: CustomEvent<number>) => {
    resolvedRealmToken = event.detail;
  };

  // Private reply channel for this individual request.
  const responseTarget = new EventTarget();

  responseTarget.addEventListener(REALM_TOKEN_REQUEST_EVENT, handleTokenResponse as EventListener, { once: true });

  pageDispatchEvent(
    createMouseEvent(REALM_TOKEN_REQUEST_EVENT, {
      relatedTarget: responseTarget,
    })
  );

  /*
   * If another realm answered first, this realm must stop competing for future
   * requests. The elected responder intentionally keeps its listener installed.
   */
  if (!requestHandledLocally) {
    pageRemoveEventListener(REALM_TOKEN_REQUEST_EVENT, handleTokenRequest as EventListener);
  }

  return resolvedRealmToken;
};

/**
 * Full shared realm token.
 *
 * Keep this value private. Public bridge identifiers should expose only
 * deliberately reduced projections of it.
 */
const realBridgeToken = resolveRealmToken();

/**
 * Derives a compact public bridge face ID from the private realm token:
 *
 *   r      = token % D
 *   face   = r + K
 *   faceID = "REALM_BRIDGE_" + base36(face)
 *
 * where:
 *
 *   D = 75,326,071
 *       A prime in (√2^52, √2^53).
 *
 *   L = 36^5 = 60,466,176
 *
 *   K = 2L = 120,932,352
 *
 * JavaScript `%` is a signed remainder, not a mathematical modulo. Therefore:
 *
 *   -(D - 1) <= token % D <= D - 1
 *
 * giving at most 2D - 1 possible signed remainder values. For this D that is
 * 150,652,141 possible values, with an absolute information ceiling of:
 *
 *   log2(2D - 1) ≈ 27.17 bits
 *
 * before accounting for bias in the token distribution and IEEE-754 rounding.
 *
 * K is purely a translation and adds no entropy. Since K > D - 1, it ensures
 * the resulting numeric face is strictly positive even when `%` returns a
 * negative remainder:
 *
 *   45,606,282 <= face <= 196,258,422
 *
 * Using a prime D avoids simple common-factor structure with the underlying
 * integer lattice, but does not by itself guarantee a perfectly uniform
 * distribution.
 *
 * The face ID is intentionally a lossy projection of realBridgeToken and
 * should not be treated as secret, collision-free, or cryptographically
 * unpredictable.
 */
export const realmBridgeFaceID = `REALM_BRIDGE_${((realBridgeToken % 75326071) + 120932352).toString(36)}`;

// Independent projection using a different prime modulus:
// export const realmBridgeNumer01 = realBridgeToken % 91961549 + 120932352;
