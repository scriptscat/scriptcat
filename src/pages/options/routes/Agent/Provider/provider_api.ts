import type { AgentModelConfig } from "@App/app/service/agent/core/types";

type Provider = AgentModelConfig["provider"];
type FetchLike = typeof fetch;

// 各 provider 的默认 API Base URL（与 release/v1.4-agent 保持一致）
export function getDefaultBaseUrl(provider: Provider): string {
  switch (provider) {
    case "anthropic":
      return "https://api.anthropic.com";
    case "zhipu":
      return "https://open.bigmodel.cn/api/paas/v4";
    default:
      return "https://api.openai.com/v1";
  }
}

type ModelReqInput = Pick<AgentModelConfig, "provider" | "apiBaseUrl" | "apiKey">;

// 构造「拉取模型列表」请求的 URL 与请求头
export function buildModelsRequest(m: ModelReqInput): { url: string; headers: Record<string, string> } {
  const baseUrl = m.apiBaseUrl || getDefaultBaseUrl(m.provider);
  const headers: Record<string, string> = {};
  let url: string;
  if (m.provider === "anthropic") {
    url = `${baseUrl}/v1/models`;
    headers["x-api-key"] = m.apiKey;
    headers["anthropic-version"] = "2023-06-01";
    headers["anthropic-dangerous-direct-browser-access"] = "true";
  } else {
    url = `${baseUrl}/models`;
    if (m.apiKey) headers["Authorization"] = `Bearer ${m.apiKey}`;
  }
  return { url, headers };
}

// 构造「测试连接」的对话补全请求（最小一次往返）
function buildChatRequest(m: AgentModelConfig): { url: string; headers: Record<string, string>; body: string } {
  const baseUrl = m.apiBaseUrl || getDefaultBaseUrl(m.provider);
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const systemMessage = "Reply in one brief sentence only. No thinking or reasoning.";
  const userMessage = "Greet the user warmly in a short, concise sentence.";
  if (m.provider === "anthropic") {
    headers["x-api-key"] = m.apiKey;
    headers["anthropic-version"] = "2023-06-01";
    headers["anthropic-dangerous-direct-browser-access"] = "true";
    return {
      url: `${baseUrl}/v1/messages`,
      headers,
      body: JSON.stringify({
        model: m.model || "claude-sonnet-4-20250514",
        max_tokens: 256,
        system: systemMessage,
        messages: [{ role: "user", content: userMessage }],
        stream: false,
      }),
    };
  }
  if (m.apiKey) headers["Authorization"] = `Bearer ${m.apiKey}`;
  const defaultModel = m.provider === "zhipu" ? "glm-4-flash" : "gpt-4o-mini";
  return {
    url: `${baseUrl}/chat/completions`,
    headers,
    body: JSON.stringify({
      model: m.model || defaultModel,
      max_tokens: 256,
      messages: [
        { role: "system", content: systemMessage },
        { role: "user", content: userMessage },
      ],
      stream: false,
    }),
  };
}

// 测试连接：发送一次最小对话补全，返回成败与延迟
export async function testConnection(
  m: AgentModelConfig,
  fetchImpl: FetchLike = fetch
): Promise<{ ok: boolean; latencyMs?: number; error?: string }> {
  const { url, headers, body } = buildChatRequest(m);
  const start = performance.now();
  try {
    const resp = await fetchImpl(url, { method: "POST", headers, body });
    const latencyMs = Math.round(performance.now() - start);
    if (!resp.ok) {
      const errText = await resp.text().catch(() => "");
      return { ok: false, error: `${resp.status} ${errText}`.trim() };
    }
    return { ok: true, latencyMs };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

// 拉取可用模型 ID 列表
export async function fetchModels(m: AgentModelConfig, fetchImpl: FetchLike = fetch): Promise<string[]> {
  const { url, headers } = buildModelsRequest(m);
  const resp = await fetchImpl(url, { method: "GET", headers });
  if (!resp.ok) {
    throw new Error(`${resp.status}`);
  }
  const json = await resp.json();
  return ((json.data as { id: string }[]) || []).map((item) => item.id);
}
