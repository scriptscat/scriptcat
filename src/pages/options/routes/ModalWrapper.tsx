// ModalWrapper.tsx
import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Modal, type ModalProps } from "@arco-design/web-react";

/**
 * A tiny utility that *moves the same DOM node* between a page host and a modal host
 * so the inner React tree (e.g. Monaco editor) is never re-mounted.
 */
export type ModalWrapperProps = {
  /** Whether the modal is open */
  open: boolean;
  /** Called when user closes the modal */
  onCancel?: () => void;
  /** The *existing* DOM node you want to teleport, by id. Example: "scripteditor-container" */
  targetId: string;
  /** Where to put the node when modal is closed. CSS selector. Example: "#scripteditor-layout-content" */
  pageHostSelector: string;
  /**
   * Optional fallback content to render *once* inside the modal when the target node doesn't exist yet
   * (e.g. first open).
   */
  fallback?: React.ReactNode;
  /** Pass-through props to Arco Modal */
  modalProps?: Omit<ModalProps, "visible" | "onCancel">;
};

export default function ModalWrapper({
  open,
  onCancel,
  targetId,
  pageHostSelector,
  fallback,
  modalProps,
}: ModalWrapperProps) {
  const modalBodyRef = useRef<HTMLDivElement | null>(null);
  const [mounted, setMounted] = useState(false);
  const [useFallback, setUseFallback] = useState(false);

  // Remember original parent/nextSibling the very first time we see the node
  const originalParentRef = useRef<HTMLElement | null>(null);
  const originalNextRef = useRef<ChildNode | null>(null);

  const getTarget = () => document.getElementById(targetId) as HTMLElement | null;
  const getPageHost = () => document.querySelector(pageHostSelector) as HTMLElement | null;

  // Ensure modal body ref exists early to avoid a flash
  useLayoutEffect(() => {
    if (!modalBodyRef.current) modalBodyRef.current = document.createElement("div");
    setMounted(true);
  }, []);

  // Core swapper: move the existing node into the desired host
  const moveInto = (host: HTMLElement | null) => {
    const node = getTarget();
    if (!node || !host) return false;

    // First time we ever move the node, remember its original place
    if (!originalParentRef.current) {
      originalParentRef.current = node.parentElement as HTMLElement | null;
      originalNextRef.current = node.nextSibling;
    }

    // Avoid redundant moves
    if (node.parentElement === host) return true;
    try {
      host.appendChild(node);
      return true;
    } catch {
      return false;
    }
  };

  // When opening: try to adopt the existing node; if not found, allow fallback
  useEffect(() => {
    if (!mounted) return;
    if (!open) return;
    console.log(12388);

    const ok = moveInto(modalBodyRef.current!);
    if (!ok) {
      // Target not available yet -> let the fallback render a first-time instance
      setUseFallback(true);
    } else {
      setUseFallback(false);
    }
  }, [open, mounted]);

  // When closing: move the node back to the page host
  useEffect(() => {
    if (!mounted) return;
    if (open) return;

    // Prefer explicit page host; if missing, restore to original place
    const pageHost = getPageHost() || originalParentRef.current;
    if (pageHost) moveInto(pageHost);
  }, [open, mounted]);

  // Safety: on unmount, try to return node to its original place
  useEffect(() => {
    return () => {
      const parent = originalParentRef.current || getPageHost();
      if (parent) moveInto(parent);
    };
  }, []);

  // Render the modal with our internal host. When fallback is needed, render it once.
  return (
    <Modal
      visible={open}
      onCancel={onCancel}
      footer={null}
      style={{ width: "96vw", maxWidth: "96vw" }}
      closeIcon={null}
      {...modalProps}
    >
      {/* Our private modal host. We move the target node *into* this element. */}
      <div id={`modal-for-${targetId}`} ref={modalBodyRef as any} />
      {useFallback && fallback}
    </Modal>
  );
}
