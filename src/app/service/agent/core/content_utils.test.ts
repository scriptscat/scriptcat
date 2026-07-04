import { describe, it, expect } from "vitest";
import { getTextContent, normalizeContent, isContentBlocks } from "./content_utils";
import type { ContentBlock } from "./types";

describe("content_utils", () => {
  describe("getTextContent", () => {
    it("returns string content as-is", () => {
      expect(getTextContent("hello world")).toBe("hello world");
    });

    it("returns empty string for empty string", () => {
      expect(getTextContent("")).toBe("");
    });

    it("extracts text from ContentBlock[]", () => {
      const blocks: ContentBlock[] = [
        { type: "text", text: "Hello " },
        { type: "image", attachmentId: "img1", mimeType: "image/png", name: "test.png" },
        { type: "text", text: "world" },
      ];
      expect(getTextContent(blocks)).toBe("Hello world");
    });

    it("returns empty string for ContentBlock[] with no text blocks", () => {
      const blocks: ContentBlock[] = [
        { type: "image", attachmentId: "img1", mimeType: "image/png" },
        { type: "file", attachmentId: "f1", mimeType: "application/pdf", name: "doc.pdf" },
      ];
      expect(getTextContent(blocks)).toBe("");
    });

    it("returns empty string for empty ContentBlock[]", () => {
      expect(getTextContent([])).toBe("");
    });

    it("handles audio blocks (skipped in text extraction)", () => {
      const blocks: ContentBlock[] = [
        { type: "text", text: "Listen: " },
        { type: "audio", attachmentId: "a1", mimeType: "audio/wav", name: "clip.wav", durationMs: 5000 },
      ];
      expect(getTextContent(blocks)).toBe("Listen: ");
    });
  });

  describe("normalizeContent", () => {
    it("converts string to TextBlock[]", () => {
      expect(normalizeContent("hello")).toEqual([{ type: "text", text: "hello" }]);
    });

    it("returns empty array for empty string", () => {
      expect(normalizeContent("")).toEqual([]);
    });

    it("returns ContentBlock[] as-is", () => {
      const blocks: ContentBlock[] = [
        { type: "text", text: "hello" },
        { type: "image", attachmentId: "img1", mimeType: "image/png" },
      ];
      expect(normalizeContent(blocks)).toBe(blocks);
    });

    it("returns empty array as-is", () => {
      const blocks: ContentBlock[] = [];
      expect(normalizeContent(blocks)).toBe(blocks);
    });
  });

  describe("isContentBlocks", () => {
    it("returns false for string", () => {
      expect(isContentBlocks("hello")).toBe(false);
    });

    it("returns true for ContentBlock[]", () => {
      expect(isContentBlocks([{ type: "text", text: "hello" }])).toBe(true);
    });

    it("returns true for empty array", () => {
      expect(isContentBlocks([])).toBe(true);
    });
  });
});
