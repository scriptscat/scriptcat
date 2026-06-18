export default function MockCodeEditor({
  id,
  code,
  diffCode,
}: {
  id: string;
  code?: string;
  diffCode?: string;
}) {
  return <div data-testid="code-body" data-id={id} data-code={code} data-diff={diffCode ?? ""} />;
}
