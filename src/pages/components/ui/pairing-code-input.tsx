import { useRef, type ClipboardEvent, type KeyboardEvent } from "react";
import { cn } from "@App/pkg/utils/cn";

export interface PairingCodeInputProps {
  /** Current code, concatenated without the visual separator (e.g. "3F9K7Q2A"). */
  value: string;
  onChange: (value: string) => void;
  /** Total number of cells / code characters. */
  length?: number;
  /** Insert a dash separator after every `groupSize` cells (0 = no separators). */
  groupSize?: number;
  /** Fired once the last cell is filled (value reaches `length`). */
  onComplete?: (value: string) => void;
  autoFocus?: boolean;
  disabled?: boolean;
  className?: string;
  "aria-label": string;
  "data-testid"?: string;
}

// Only the accepted charset survives; the daemon derives the pairing key from a normalized form
// (offscreen/external-access-connect.ts:normalizePairingCode maps O→0, I/L→1), so we keep display
// permissive here — uppercased alphanumerics — and let that boundary normalize.
const sanitize = (raw: string) => raw.replace(/[^0-9a-zA-Z]/g, "").toUpperCase();

/**
 * Segmented pairing-code input (OTP style): N single-character cells with an optional dash between
 * groups, matching the 接入 sctl 对话框 design (8 cells, 4-4 split). Typing advances focus, Backspace
 * retreats, arrow keys navigate, and pasting a full code fills every cell at once. The dash is
 * purely visual — `value`/`onChange` carry the concatenated characters only.
 */
export function PairingCodeInput({
  value,
  onChange,
  length = 8,
  groupSize = 4,
  onComplete,
  autoFocus,
  disabled,
  className,
  "aria-label": ariaLabel,
  "data-testid": testId,
}: PairingCodeInputProps) {
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const chars = value.slice(0, length).padEnd(length, " ").split("");

  const focusCell = (index: number) => {
    const clamped = Math.max(0, Math.min(length - 1, index));
    refs.current[clamped]?.focus();
    refs.current[clamped]?.select();
  };

  const commit = (next: string) => {
    const trimmed = next.replace(/\s+$/g, "");
    onChange(trimmed);
    if (trimmed.length === length) onComplete?.(trimmed);
  };

  const setCharAt = (index: number, char: string) => {
    const arr = value.slice(0, length).padEnd(length, " ").split("");
    arr[index] = char || " ";
    return arr.join("").replace(/\s+$/g, "");
  };

  const handleChange = (index: number, raw: string) => {
    const cleaned = sanitize(raw);
    if (!cleaned) return;
    // Typing over a filled cell, or a browser that batches keystrokes, can hand us several chars —
    // spread them across this cell and the ones after it (same effect as a short paste).
    const next = value.slice(0, length).padEnd(length, " ").split("");
    let cursor = index;
    for (const ch of cleaned) {
      if (cursor >= length) break;
      next[cursor] = ch;
      cursor += 1;
    }
    commit(next.join("").replace(/\s+$/g, ""));
    focusCell(cursor);
  };

  const handleKeyDown = (index: number, e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace") {
      e.preventDefault();
      if (chars[index].trim()) {
        commit(setCharAt(index, ""));
      } else if (index > 0) {
        commit(setCharAt(index - 1, ""));
        focusCell(index - 1);
      }
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      focusCell(index - 1);
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      focusCell(index + 1);
    }
  };

  const handlePaste = (index: number, e: ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const cleaned = sanitize(e.clipboardData.getData("text"));
    if (!cleaned) return;
    const arr = value.slice(0, length).padEnd(length, " ").split("");
    let cursor = index;
    for (const ch of cleaned) {
      if (cursor >= length) break;
      arr[cursor] = ch;
      cursor += 1;
    }
    commit(arr.join("").replace(/\s+$/g, ""));
    focusCell(cursor);
  };

  return (
    <div
      data-slot="pairing-code-input"
      data-testid={testId}
      role="group"
      aria-label={ariaLabel}
      className={cn("flex items-center justify-center gap-2", className)}
    >
      {chars.map((char, index) => (
        <div key={index} className="flex items-center gap-2">
          {groupSize > 0 && index > 0 && index % groupSize === 0 && (
            <span aria-hidden className="h-0.5 w-3 rounded-full bg-muted-foreground/50" />
          )}
          <input
            ref={(el) => {
              refs.current[index] = el;
            }}
            data-testid={testId ? `${testId}-cell-${index}` : undefined}
            type="text"
            inputMode="text"
            autoCapitalize="characters"
            autoComplete="off"
            spellCheck={false}
            maxLength={1}
            disabled={disabled}
            autoFocus={autoFocus && index === 0}
            aria-label={`${ariaLabel} ${index + 1}`}
            value={char.trim()}
            onChange={(e) => handleChange(index, e.target.value)}
            onKeyDown={(e) => handleKeyDown(index, e)}
            onPaste={(e) => handlePaste(index, e)}
            onFocus={(e) => e.target.select()}
            className={cn(
              "size-10 rounded-md border border-input bg-background text-center font-mono text-lg font-semibold uppercase text-foreground shadow-sm outline-none transition-colors",
              "focus-visible:border-primary focus-visible:ring-1 focus-visible:ring-primary",
              "disabled:cursor-not-allowed disabled:opacity-50"
            )}
          />
        </div>
      ))}
    </div>
  );
}
