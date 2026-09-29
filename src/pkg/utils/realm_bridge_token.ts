import {
  createMouseEvent,
  CustomEventClone,
  pageAddEventListener,
  pageDispatchEvent,
  pageRemoveEventListener,
} from "@Packages/message/common";

const channelId = process.env.SC_RANDOM_KEY!;

/**
 * scripting.js, content.js, inject.js -> 3 times
 */
const REALM_PARTICIPANT_COUNT = 3;
let remainingTokenClaims = REALM_PARTICIPANT_COUNT;

const REALM_TOKEN_REQUEST_EVENT = `REALM_TOKEN_REQUEST_${channelId}`;

const createRealmToken = () =>
  `${Math.random().toString(36).substring(2)}${Math.random().toString(36).substring(2)}${Math.random().toString(36).substring(2)}`;

let activeRealmToken = createRealmToken();
let resolvedRealmToken: string;
let requestHandledLocally = false;

/*
 * Usually runs during initialization.
 * The function reference is expected to remain unchanged.
 */
const resolveRealmToken = () => {
  if (resolvedRealmToken) return resolvedRealmToken;

  const handleTokenRequest = (event: MouseEvent) => {
    const token = activeRealmToken;

    if (--remainingTokenClaims === 0) {
      activeRealmToken = createRealmToken();
      remainingTokenClaims = REALM_PARTICIPANT_COUNT;
    }

    event.stopImmediatePropagation();

    event.relatedTarget?.dispatchEvent(
      new CustomEventClone(REALM_TOKEN_REQUEST_EVENT, {
        detail: token,
      })
    );

    requestHandledLocally = true;
  };

  pageAddEventListener(REALM_TOKEN_REQUEST_EVENT, handleTokenRequest as EventListener);

  const handleTokenResponse = (event: CustomEvent<string>) => {
    resolvedRealmToken = event.detail;
  };

  const responseTarget = new EventTarget();

  responseTarget.addEventListener(REALM_TOKEN_REQUEST_EVENT, handleTokenResponse as EventListener, { once: true });

  pageDispatchEvent(
    createMouseEvent(REALM_TOKEN_REQUEST_EVENT, {
      relatedTarget: responseTarget,
    })
  );

  if (!requestHandledLocally) {
    pageRemoveEventListener(REALM_TOKEN_REQUEST_EVENT, handleTokenRequest as EventListener);
  }

  return resolvedRealmToken;
};

export const realmBridgeToken = resolveRealmToken();
