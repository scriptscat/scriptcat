import crypto from "crypto-js";
import jsTokens from "js-tokens";
import { parseMetadata, parseMetadataLines } from "./script";
import { getUserConfigStr } from "./utils";

const SHINGLE_SIZE = 5;
const FINGERPRINT_SIZE = 256;
const UTF8_ENCODER = new TextEncoder();
const STRUCTURAL_TOKEN = /^[{}()[\];,.]+$/;
const IGNORED_TOKENS = new Set([
  "WhiteSpace",
  "LineTerminatorSequence",
  "SingleLineComment",
  "MultiLineComment",
  "HashbangComment",
]);

// These directives can alter execution, capabilities, injection scope, dependencies, or update sources.
// Unknown tags are conservatively marked sensitive; they can be provided by ScriptCat or other managers.
const INFORMATIONAL_TAGS = new Set([
  "name",
  "namespace",
  "version",
  "description",
  "author",
  "homepage",
  "homepageurl",
  "supporturl",
  "icon",
  "iconurl",
  "icon64",
  "icon64url",
  "license",
]);

function isInformationalTag(tag: string): boolean {
  // Localized @name:xx / @description:xx directives are display text, not new capabilities.
  return INFORMATIONAL_TAGS.has(tag) || tag.startsWith("name:") || tag.startsWith("description:");
}

export interface MetadataChange {
  tag: string;
  oldValues: string[];
  newValues: string[];
  sensitive: boolean;
}

export interface ScriptUpdateComparison {
  codeSimilarity: number;
  codeComparable: boolean;
  metadataValid: boolean;
  metadataChanges: MetadataChange[];
  userConfigChanged: boolean;
}

export type MetadataComparison = Omit<ScriptUpdateComparison, "codeSimilarity" | "codeComparable">;

function tokenize(code: string): string[] {
  return [...jsTokens(code)].filter((token) => !IGNORED_TOKENS.has(token.type)).map((token) => token.value);
}

function hashShingle(tokens: string[]): string {
  const values = tokens.map((token) => UTF8_ENCODER.encode(token));
  const bytes = new Uint8Array(values.reduce((total, value) => total + 4 + value.length, 0));
  const lengths = new DataView(bytes.buffer);
  let offset = 0;
  for (const value of values) {
    lengths.setUint32(offset, value.length, false);
    offset += 4;
    bytes.set(value, offset);
    offset += value.length;
  }
  // CryptoJS WordArray stores bytes in big-endian 32-bit words. The first 16 hex
  // digits are SHA-256's first 64 bits, comparable lexicographically when zero-padded.
  const words: number[] = [];
  bytes.forEach((byte, index) => {
    words[index >>> 2] = (words[index >>> 2] || 0) | (byte << (24 - (index % 4) * 8));
  });
  return crypto.SHA256(crypto.lib.WordArray.create(words, bytes.length)).toString().slice(0, 16);
}

function fingerprint(tokens: string[]): string[] {
  const meaningful = tokens.filter((token) => !STRUCTURAL_TOKEN.test(token));
  if (meaningful.length === 0) return [];
  const width = Math.min(SHINGLE_SIZE, meaningful.length);
  const selected: string[] = [];
  const seen = new Set<string>();
  for (let i = 0; i <= meaningful.length - width; i++) {
    const hash = hashShingle(meaningful.slice(i, i + width));
    if (seen.has(hash)) continue;
    if (selected.length < FINGERPRINT_SIZE) {
      selected.push(hash);
      seen.add(hash);
      selected.sort();
    } else if (hash < selected[selected.length - 1]) {
      seen.delete(selected.pop()!);
      selected.push(hash);
      seen.add(hash);
      selected.sort();
    }
  }
  return selected;
}

function compareCode(
  oldSource: string,
  newSource: string
): Pick<ScriptUpdateComparison, "codeSimilarity" | "codeComparable"> {
  const oldTokens = tokenize(oldSource);
  const newTokens = tokenize(newSource);
  if (
    !oldTokens.some((token) => !STRUCTURAL_TOKEN.test(token)) ||
    !newTokens.some((token) => !STRUCTURAL_TOKEN.test(token))
  ) {
    return { codeSimilarity: 0, codeComparable: false };
  }
  if (oldTokens.length === newTokens.length && oldTokens.every((token, i) => token === newTokens[i])) {
    return { codeSimilarity: 1, codeComparable: true };
  }

  const a = fingerprint(oldTokens);
  const b = fingerprint(newTokens);
  const cutoffs: string[] = [];
  if (a.length === FINGERPRINT_SIZE) cutoffs.push(a[a.length - 1]);
  if (b.length === FINGERPRINT_SIZE) cutoffs.push(b[b.length - 1]);
  const cutoff = cutoffs.length > 0 ? cutoffs.sort()[0] : null;
  const aa = cutoff ? a.filter((hash) => hash <= cutoff) : a;
  const bb = cutoff ? b.filter((hash) => hash <= cutoff) : b;
  const shared = aa.filter((hash) => bb.includes(hash)).length;
  const union = new Set([...aa, ...bb]).size;
  const jaccard = union === 0 ? 0 : shared / union;
  const lengthRatio = Math.min(oldTokens.length, newTokens.length) / Math.max(oldTokens.length, newTokens.length);
  return { codeSimilarity: Math.min(jaccard, lengthRatio, 0.999), codeComparable: true };
}

function metadataValues(code: string): Map<string, string[]> {
  const values = new Map<string, string[]>();
  for (const line of parseMetadataLines(code)) {
    const entries = values.get(line.tag) ?? [];
    entries.push(line.value);
    values.set(line.tag, entries);
  }
  return values;
}

function compareMetadata(oldCode: string, newCode: string): MetadataChange[] {
  const oldValues = metadataValues(oldCode);
  const newValues = metadataValues(newCode);
  const changes: MetadataChange[] = [];
  for (const tag of new Set([...oldValues.keys(), ...newValues.keys()])) {
    const before = oldValues.get(tag) ?? [];
    const after = newValues.get(tag) ?? [];
    if (before.length === after.length && before.every((value, index) => value === after[index])) continue;
    changes.push({ tag, oldValues: before, newValues: after, sensitive: !isInformationalTag(tag) });
  }
  return changes;
}

export function compareScriptUpdates(oldCode: string, newCode: string): ScriptUpdateComparison {
  return {
    ...compareCode(oldCode, newCode),
    metadataValid: !!parseMetadata(oldCode) && !!parseMetadata(newCode),
    metadataChanges: compareMetadata(oldCode, newCode),
    userConfigChanged: getUserConfigStr(oldCode) !== getUserConfigStr(newCode),
  };
}
