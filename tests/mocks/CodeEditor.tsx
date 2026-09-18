import { useEffect, useImperativeHandle, type Ref } from "react";

// 真实编辑器要等偏好设置读出来才创建实例并回调。默认模拟「已就绪」，
// 需要停在就绪之前（例如断言代码骨架）的用例调 setEditorMounts(false)。
let editorMounts = true;
export function setEditorMounts(v: boolean) {
  editorMounts = v;
}

export const revealLine = { calls: [] as number[] };

export default function MockCodeEditor({
  id,
  code,
  diffCode,
  onEditorMount,
  onReady,
  ref,
}: {
  id: string;
  code?: string;
  diffCode?: string;
  onEditorMount?: (editor: unknown) => void;
  onReady?: () => void;
  ref?: Ref<{ editor: unknown; revealLine: (line: number) => void }>;
}) {
  useImperativeHandle(ref, () => ({
    editor: {},
    revealLine: (line: number) => revealLine.calls.push(line),
  }));
  useEffect(() => {
    if (!editorMounts) return;
    // 与真实实现一致：diff 预览没有可编辑实例，只报告就绪
    if (!diffCode) onEditorMount?.({});
    onReady?.();
  }, [diffCode, onEditorMount, onReady]);
  return <div data-testid="code-body" data-id={id} data-code={code} data-diff={diffCode ?? ""} />;
}
