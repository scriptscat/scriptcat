import React, { useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";

// 与桌面端 CodeEditor 一致的 Props 结构
export type MobileEditorProps = {
  className?: string;
  diffCode?: string;
  editable?: boolean;
  id: string;
  code?: string;
  onReady?: (editor: any) => void;
};

// 提供一个最小可用的 editor stub，满足现有调用：
// - getValue()
// - setValue(text)
// - addAction(action) => no-op
// - onKeyUp(cb) => 记录回调，textarea keyup/input 时触发
// - focus()
// - dispose()
// - 可被动态添加属性：uuid
const createEditorStub = (opts: { get: () => string; set: (v: string) => void; focus: () => void }) => {
  const keyupHandlers = new Set<() => void>();
  const stub: any = {
    getValue: () => opts.get(),
    setValue: (v: string) => opts.set(v),
    addAction: (_: any) => {
      // 移动端暂不支持快捷键，保留接口
    },
    onKeyUp: (cb: () => void) => {
      keyupHandlers.add(cb);
    },
    __emitKeyUp: () => {
      keyupHandlers.forEach((cb) => cb());
    },
    focus: () => opts.focus(),
    dispose: () => {
      keyupHandlers.clear();
    },
  };
  return stub;
};

const MobileEditor: React.ForwardRefRenderFunction<{ editor: any }, MobileEditorProps> = (
  { id, className, code, editable, onReady },
  ref
) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [value, setValue] = useState<string>(code ?? "");

  // 与桌面保持同步，当外部 code 变化时更新本地状态
  useEffect(() => {
    if (code !== undefined && code !== value) {
      setValue(code);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  const editorStub = useMemo(
    () =>
      createEditorStub({
        get: () => value,
        set: (v: string) => setValue(v),
        focus: () => textareaRef.current?.focus(),
      }),
    [value]
  );

  useImperativeHandle(ref, () => ({ editor: editorStub }), [editorStub]);

  useEffect(() => {
    onReady?.(editorStub);
  }, [editorStub, onReady]);

  const handleChange: React.ChangeEventHandler<HTMLTextAreaElement> = (e) => {
    setValue(e.target.value);
    (editorStub as any).__emitKeyUp();
  };

  const handleKeyUp: React.KeyboardEventHandler<HTMLTextAreaElement> = () => {
    (editorStub as any).__emitKeyUp();
  };

  // 自适应填满容器
  const style: React.CSSProperties = {
    width: "100%",
    height: "100%",
    resize: "none",
    outline: "none",
    border: "none",
    padding: 8,
    background: "var(--color-bg-1, #fff)",
    color: "var(--color-text-1, #000)",
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, "Courier New", monospace',
    fontSize: 14,
    lineHeight: 1.5,
    whiteSpace: "pre",
    overflow: "auto",
  };

  return (
    <textarea
      id={id}
      ref={textareaRef}
      className={className}
      value={value}
      onChange={handleChange}
      onKeyUp={handleKeyUp}
      readOnly={editable === false}
      spellCheck={false}
      autoComplete="off"
      autoCorrect="off"
      autoCapitalize="off"
      style={style}
    />
  );
};

export default React.forwardRef(MobileEditor);
