import { describe, expect, it } from "vitest";
import { CustomEventMessage } from "./custom_event_message";

let flagCounter = 0;

function createMessagePair() {
  const eventFlag = `custom-event-message-test-${++flagCounter}`;
  const sender = new CustomEventMessage(eventFlag, false, "");
  const receiver = new CustomEventMessage(eventFlag, true, "");

  expect(sender.readyWrap.isReady).toBe(true);
  expect(receiver.readyWrap.isReady).toBe(true);
  return { sender, receiver };
}

describe("CustomEventMessage relatedTarget lifecycle", () => {
  it("stores a received target on the receiving message until it is consumed", () => {
    const { sender, receiver } = createMessagePair();
    const target = document.createElement("div");
    const id = sender.sendRelatedTarget(target);

    try {
      expect(receiver.relatedTarget.get(id)).toBe(target);
      expect(receiver.relatedTarget).toHaveProperty("size", 1);

      expect(receiver.getAndDelRelatedTarget(id)).toBe(target);
      expect(receiver.relatedTarget.has(id)).toBe(false);
    } finally {
      receiver.getAndDelRelatedTarget(id);
    }
  });

  it("keeps targets from opposite message directions independently owned", () => {
    const { sender, receiver } = createMessagePair();
    const senderTarget = document.createElement("div");
    const receiverTarget = document.createElement("span");
    const senderTargetId = sender.sendRelatedTarget(senderTarget);
    const receiverTargetId = receiver.sendRelatedTarget(receiverTarget);

    try {
      expect(receiver.relatedTarget.get(senderTargetId)).toBe(senderTarget);
      expect(sender.relatedTarget.get(receiverTargetId)).toBe(receiverTarget);
      expect(sender.relatedTarget.has(senderTargetId)).toBe(false);
      expect(receiver.relatedTarget.has(receiverTargetId)).toBe(false);
    } finally {
      sender.getAndDelRelatedTarget(senderTargetId);
      receiver.getAndDelRelatedTarget(receiverTargetId);
    }
  });
});
