import { useEffect } from "react";

// 真实编辑器要等偏好设置读出来才创建实例并回调 onEditorMount。默认模拟「已就绪」，
// 需要停在就绪之前（例如断言代码骨架）的用例调 setEditorMounts(false)。
let editorMounts = true;
export function setEditorMounts(v: boolean) {
  editorMounts = v;
}

export default function MockCodeEditor({
  id,
  code,
  diffCode,
  onEditorMount,
}: {
  id: string;
  code?: string;
  diffCode?: string;
  onEditorMount?: (editor: unknown) => void;
}) {
  useEffect(() => {
    if (editorMounts) onEditorMount?.({});
  }, [onEditorMount]);
  return <div data-testid="code-body" data-id={id} data-code={code} data-diff={diffCode ?? ""} />;
}
