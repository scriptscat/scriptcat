import type { ReactNode } from "react";

type ScrollBoundaryProps = {
  children: ReactNode;
  parentNodeSelector: string;
};

/**
 * Handles wheel events bubbling up to the scroll boundary.
 *
 * - Monaco editor: prevent default so the editor's own scroll logic runs
 *   without interference from the browser or ancestor handlers.
 * - Everywhere else: stop propagation so parent/page-level handlers ignore
 *   wheel gestures originating inside this boundary.
 *   (preventDefault is intentionally left commented out to allow native
 *   scrolling within non-editor children.)
 */
const handleScrollBoundaryWheel = (evt: Event) => {
  if ((evt.target as Element).closest(".monaco-editor")) {
    evt.preventDefault();
  } else {
    evt.stopImmediatePropagation();
    evt.stopPropagation();
    // evt.preventDefault();
  }
};

/**
 * Registers the wheel handler on the given target node.
 * Removes any existing listener first to guarantee exactly one handler is
 * attached, even if called multiple times (e.g. on re-renders).
 *
 * Options: non-capturing, non-passive (required for preventDefault to work),
 * and persistent (once: false).
 */
const attachScrollBoundaryHandler = (target: Node | null) => {
  const o = { capture: false, passive: false, once: false };
  target?.removeEventListener("wheel", handleScrollBoundaryWheel, o);
  target?.addEventListener("wheel", handleScrollBoundaryWheel, o);
};

/**
 * Establishes a wheel-event boundary at the root level.
 *
 * Wheel behavior within the boundary:
 * - Inside Monaco editor instances: prevents default so editor scrolling
 *   stays isolated from browser and ancestor handlers.
 * - Outside Monaco: stops propagation so parent/page-level handlers do not
 *   react to wheel gestures originating inside this boundary.
 */
export default function ScrollBoundary({ children, parentNodeSelector }: ScrollBoundaryProps) {
  // Attach once per render; the handler is idempotent due to the
  // remove-then-add pattern in attachScrollBoundaryHandler.
  attachScrollBoundaryHandler(document.querySelector(parentNodeSelector));
  return <>{children}</>;
}
