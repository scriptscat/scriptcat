import type { AgentModelConfig, AgentModelSafeConfig, ModelApiRequest } from "@App/app/service/agent/core/types";
import { AgentModelRepo } from "@App/app/repo/agent_model";
import { supportsVision, supportsImageOutput } from "@App/app/service/agent/core/model_capabilities";
import type { Group } from "@Packages/message/server";

export class AgentModelService {
  modelRepo: AgentModelRepo;

  constructor(
    private group: Group,
    modelRepo?: AgentModelRepo
  ) {
    this.modelRepo = modelRepo ?? new AgentModelRepo();
  }

  init(): void {
    // Model CRUD（供 Options UI 调用）
    this.group.on("listModels", () => this.modelRepo.listModels());
    this.group.on("getModel", (id: string) => this.modelRepo.getModel(id));
    this.group.on("saveModel", (model: AgentModelConfig) => this.modelRepo.saveModel(model));
    this.group.on("removeModel", (id: string) => this.modelRepo.removeModel(id));
    this.group.on("getDefaultModelId", () => this.modelRepo.getDefaultModelId());
    this.group.on("setDefaultModelId", (id: string) => this.modelRepo.setDefaultModelId(id));
    // 摘要模型 API（供 Options UI 调用）
    this.group.on("getSummaryModelId", () => this.modelRepo.getSummaryModelId());
    this.group.on("setSummaryModelId", (id: string) => this.modelRepo.setSummaryModelId(id));
  }

  // 获取模型配置（用户指定 ID → 默认 ID → 第一个可用）
  async getModel(modelId?: string): Promise<AgentModelConfig> {
    let model: AgentModelConfig | undefined;
    if (modelId) {
      model = await this.modelRepo.getModel(modelId);
    }
    if (!model) {
      const defaultId = await this.modelRepo.getDefaultModelId();
      if (defaultId) {
        model = await this.modelRepo.getModel(defaultId);
      }
    }
    if (!model) {
      const models = await this.modelRepo.listModels();
      if (models.length > 0) {
        model = models[0];
      }
    }
    if (!model) {
      throw new Error("No model configured. Please configure a model in Agent settings.");
    }
    return model;
  }

  // 获取 summary 专用模型（回退到默认/首个）
  async getSummaryModel(): Promise<AgentModelConfig> {
    let model: AgentModelConfig | undefined;
    const summaryId = await this.modelRepo.getSummaryModelId();
    if (summaryId) {
      model = await this.modelRepo.getModel(summaryId);
    }
    if (!model) {
      const defaultId = await this.modelRepo.getDefaultModelId();
      if (defaultId) {
        model = await this.modelRepo.getModel(defaultId);
      }
    }
    if (!model) {
      throw new Error("No model configured for summarization");
    }
    return model;
  }

  // 去除敏感字段，同时补充 supportsVision / supportsImageOutput 的自动检测 fallback
  stripApiKey(model: AgentModelConfig): AgentModelSafeConfig {
    const { apiKey: _, ...safe } = model;
    safe.supportsVision = supportsVision(model);
    safe.supportsImageOutput = supportsImageOutput(model);
    return safe;
  }

  // 处理 CAT.agent.model API 请求（只读，隐藏 apiKey），供 GMApi 调用
  async handleModelApi(
    request: ModelApiRequest
  ): Promise<AgentModelSafeConfig[] | AgentModelSafeConfig | null | string> {
    switch (request.action) {
      case "list": {
        const models = await this.modelRepo.listModels();
        return models.map((m) => this.stripApiKey(m));
      }
      case "get": {
        const model = await this.modelRepo.getModel(request.id);
        return model ? this.stripApiKey(model) : null;
      }
      case "getDefault":
        return this.modelRepo.getDefaultModelId();
      case "getSummary":
        return this.modelRepo.getSummaryModelId();
      default:
        throw new Error(`Unknown model API action: ${(request as any).action}`);
    }
  }
}
