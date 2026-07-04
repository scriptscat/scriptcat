import { useEffect } from "react";
import type { RefObject } from "react";
import type { editor } from "monaco-editor";

/**
 * 切换激活标签后,把键盘焦点恢复到对应的 Monaco 编辑器实例。
 *
 * 各标签的编辑器实例常驻挂载(非激活仅 display:none),光标/滚动/选区由实例自身保留,
 * 切换时唯一丢失的是键盘焦点——这里在激活标签变化后补回 focus,顺带恢复当前行高亮
 * (editor 配置了 renderLineHighlightOnlyWhenFocus)。
 */
export function useActiveEditorFocus(
  activeUuid: string | null | undefined,
  editorsRef: RefObject<Map<string, editor.IStandaloneCodeEditor>>
) {
  useEffect(() => {
    if (!activeUuid) return;
    editorsRef.current.get(activeUuid)?.focus();
    // editorsRef 为稳定引用,只需在 activeUuid 变化时重新聚焦
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeUuid]);
}
