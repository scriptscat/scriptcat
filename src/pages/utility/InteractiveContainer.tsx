import type { HTMLAttributes, ReactNode } from "react";

type InteractiveContainerProps = {
  children: ReactNode;
} & HTMLAttributes<HTMLDivElement>;

const handleContainerWheel = (evt: Event) => {
  if ((evt.target as Element).closest(".monaco-editor")) {
    evt.preventDefault();
  } else {
    evt.stopImmediatePropagation();
    evt.stopPropagation();
    // evt.preventDefault();
  }
};

const attachMainHandler = (target: Node | null) => {
  const o = { capture: false, passive: false, once: false };
  target?.removeEventListener("wheel", handleContainerWheel, o);
  target?.addEventListener("wheel", handleContainerWheel, o);
};

/**
 * Wraps arbitrary interactive content and intercepts wheel events at the
 * container boundary.
 *
 * Wheel behavior:
 * - Inside Monaco editor instances, prevent the browser from handling the
 *   event so editor scrolling remains isolated.
 * - Outside Monaco, stop propagation so parent/page-level handlers do not
 *   react to wheel gestures from this container.
 */
export default function InteractiveContainer({ children }: InteractiveContainerProps) {
  attachMainHandler(document.getElementById("root"));
  return <>{children}</>;
}
