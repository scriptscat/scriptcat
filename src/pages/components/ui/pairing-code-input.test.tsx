import { useState } from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { PairingCodeInput } from "./pairing-code-input";

afterEach(cleanup);

function Harness({ onComplete, length = 8 }: { onComplete?: (v: string) => void; length?: number }) {
  const [value, setValue] = useState("");
  return (
    <PairingCodeInput
      aria-label="配对码"
      data-testid="pc"
      value={value}
      onChange={setValue}
      onComplete={onComplete}
      length={length}
    />
  );
}

const cell = (i: number) => screen.getByTestId(`pc-cell-${i}`) as HTMLInputElement;

describe("PairingCodeInput（分格配对码输入）", () => {
  it("按 length 渲染格子，并回显传入的 value", () => {
    render(<PairingCodeInput aria-label="配对码" data-testid="pc" value="3F9K" onChange={() => {}} />);
    expect(cell(0).value).toBe("3");
    expect(cell(3).value).toBe("K");
    expect(cell(4).value).toBe("");
    expect(cell(7).value).toBe("");
  });

  it("输入小写字母时以大写落入 value", () => {
    render(<Harness />);
    fireEvent.change(cell(0), { target: { value: "f" } });
    expect(cell(0).value).toBe("F");
  });

  it("逐格填满触发 onComplete，参数是拼接后的完整码", () => {
    const onComplete = vi.fn();
    render(<Harness onComplete={onComplete} />);
    "abcd1234".split("").forEach((ch, i) => fireEvent.change(cell(i), { target: { value: ch } }));
    expect(onComplete).toHaveBeenCalledWith("ABCD1234");
  });

  it("粘贴整段配对码时一次性填充所有格子并触发 onComplete（破折号/空格被清洗）", () => {
    const onComplete = vi.fn();
    render(<Harness onComplete={onComplete} />);
    fireEvent.paste(cell(0), { clipboardData: { getData: () => "3f9k-7q2a" } });
    expect(onComplete).toHaveBeenCalledWith("3F9K7Q2A");
    expect(cell(0).value).toBe("3");
    expect(cell(7).value).toBe("A");
  });

  it("在空格子按退格回退并清除前一格", () => {
    render(<Harness />);
    fireEvent.change(cell(0), { target: { value: "A" } });
    fireEvent.change(cell(1), { target: { value: "B" } });
    // 焦点此时在 cell(2)（空），退格应清掉 cell(1) 的 B
    fireEvent.keyDown(cell(2), { key: "Backspace" });
    expect(cell(1).value).toBe("");
    expect(cell(0).value).toBe("A");
  });
});
