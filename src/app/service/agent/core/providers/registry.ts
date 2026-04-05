import type { LLMProvider } from "./types";
import { openaiProvider } from "./openai";
import { anthropicProvider } from "./anthropic";

/** LLM Provider 注册表，支持按 provider 名称查找实现 */
export class ProviderRegistry {
  private providers = new Map<string, LLMProvider>();

  /** 注册一个 Provider（同名会覆盖） */
  register(provider: LLMProvider): void {
    this.providers.set(provider.name, provider);
  }

  /** 按名称获取 Provider，未注册则返回 undefined */
  get(name: string): LLMProvider | undefined {
    return this.providers.get(name);
  }

  /** 判断指定名称的 Provider 是否已注册 */
  has(name: string): boolean {
    return this.providers.has(name);
  }

  /** 返回所有已注册的 Provider 名称列表 */
  listNames(): string[] {
    return Array.from(this.providers.keys());
  }
}

export const providerRegistry = new ProviderRegistry();

// 注册内置 Provider（与 registry 同模块，消费者使用 providerRegistry 即触发注册，
// 避免 bundler 对纯副作用导入的 tree-shake）
providerRegistry.register(openaiProvider);
providerRegistry.register(anthropicProvider);
