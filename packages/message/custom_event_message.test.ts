import { describe, expect, it } from "vitest";
import { CustomEventMessage } from "./custom_event_message";
import { createMouseEvent, pageDispatchEvent } from "@Packages/message/common";

let flagCounter = 0;

function createMessagePair() {
  const eventFlag = `custom-event-message-test-${++flagCounter}`;
  const sender = new CustomEventMessage(eventFlag, false, "");
  const receiver = new CustomEventMessage(eventFlag, true, "");

  expect(sender.readyWrap.isReady).toBe(true);
  expect(receiver.readyWrap.isReady).toBe(true);
  expect(sender.relatedTarget).toHaveProperty("size", 0);
  expect(receiver.relatedTarget).toHaveProperty("size", 0);
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

  it("releases multiple targets after out-of-order consumption", () => {
    const { sender, receiver } = createMessagePair();
    const targets = [document.createElement("div"), document.createElement("span"), document.createElement("p")];
    const ids = targets.map((target) => sender.sendRelatedTarget(target));

    try {
      expect(receiver.relatedTarget).toHaveProperty("size", targets.length);
      expect(receiver.getAndDelRelatedTarget(ids[1])).toBe(targets[1]);
      expect(receiver.relatedTarget).toHaveProperty("size", 2);
      expect(receiver.getAndDelRelatedTarget(ids[1])).toBeUndefined();
      expect(receiver.relatedTarget).toHaveProperty("size", 2);
      expect(receiver.getAndDelRelatedTarget(ids[2])).toBe(targets[2]);
      expect(receiver.getAndDelRelatedTarget(ids[0])).toBe(targets[0]);
      expect(receiver.relatedTarget).toHaveProperty("size", 0);
    } finally {
      ids.forEach((id) => receiver.getAndDelRelatedTarget(id));
    }
  });

  it("does not let an unknown target id affect queued targets", () => {
    const { sender, receiver } = createMessagePair();
    const target = document.createElement("div");
    const id = sender.sendRelatedTarget(target);

    try {
      expect(receiver.getAndDelRelatedTarget(id + 1)).toBeUndefined();
      expect(receiver.relatedTarget).toHaveProperty("size", 1);
      expect(receiver.getAndDelRelatedTarget(id)).toBe(target);
      expect(receiver.getAndDelRelatedTarget(id)).toBeUndefined();
      expect(receiver.relatedTarget).toHaveProperty("size", 0);
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
      expect(sender.relatedTarget.get(senderTargetId)).toBeUndefined();
      expect(receiver.relatedTarget.get(receiverTargetId)).toBeUndefined();
      expect(sender.getAndDelRelatedTarget(senderTargetId)).toBeUndefined();
      expect(receiver.getAndDelRelatedTarget(receiverTargetId)).toBeUndefined();
      expect(receiver.getAndDelRelatedTarget(senderTargetId)).toBe(senderTarget);
      expect(sender.getAndDelRelatedTarget(receiverTargetId)).toBe(receiverTarget);
      expect(sender.relatedTarget.has(senderTargetId)).toBe(false);
      expect(receiver.relatedTarget.has(receiverTargetId)).toBe(false);
    } finally {
      sender.getAndDelRelatedTarget(senderTargetId);
      receiver.getAndDelRelatedTarget(receiverTargetId);
    }
  });

  it("keeps targets from different event channels independently owned", () => {
    const first = createMessagePair();
    const second = createMessagePair();
    const firstTarget = document.createElement("div");
    const secondTarget = document.createElement("span");
    const firstId = first.sender.sendRelatedTarget(firstTarget);
    const secondId = second.sender.sendRelatedTarget(secondTarget);

    try {
      expect(first.receiver.getAndDelRelatedTarget(secondId)).toBeUndefined();
      expect(second.receiver.getAndDelRelatedTarget(firstId)).toBeUndefined();
      expect(first.receiver.getAndDelRelatedTarget(firstId)).toBe(firstTarget);
      expect(second.receiver.getAndDelRelatedTarget(secondId)).toBe(secondTarget);
      expect(first.receiver.relatedTarget).toHaveProperty("size", 0);
      expect(second.receiver.relatedTarget).toHaveProperty("size", 0);
    } finally {
      first.receiver.getAndDelRelatedTarget(firstId);
      second.receiver.getAndDelRelatedTarget(secondId);
    }
  });

  it("does not retain entries for ordinary messages or unrelated mouse events", async () => {
    const { sender, receiver } = createMessagePair();
    receiver.onMessage((_data, sendResponse) => sendResponse({ code: 0, data: "ok" }));

    expect(
      await sender.sendMessage({
        action: "custom-event-message-test/ordinary-async",
        data: {},
      })
    ).toEqual({ code: 0, data: "ok" });
    expect(sender.syncSendMessage({ action: "custom-event-message-test/ordinary-sync", data: {} })).toEqual({
      code: 0,
      data: "ok",
    });

    pageDispatchEvent(
      createMouseEvent(receiver.receiveFlag, {
        movementX: 0,
        relatedTarget: document.createElement("div"),
        cancelable: true,
      })
    );
    pageDispatchEvent(createMouseEvent(receiver.receiveFlag, { movementX: 1, cancelable: true }));

    expect(sender.relatedTarget).toHaveProperty("size", 0);
    expect(receiver.relatedTarget).toHaveProperty("size", 0);
  });

  it("does not retain entries when sending before the channel is ready", () => {
    const sender = new CustomEventMessage(`custom-event-message-test-${++flagCounter}`, false, "");
    const target = document.createElement("div");

    expect(sender.readyWrap.isReady).toBe(false);
    expect(() => sender.sendRelatedTarget(target)).toThrow("custom_event_message is not ready.");
    expect(sender.relatedTarget).toHaveProperty("size", 0);
  });
});
