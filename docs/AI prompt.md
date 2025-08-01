# AI Prompt

我将在这里记录下开发过程中的AI提示词，让AI更好的助力项目发展（使用VSCode Github Copilot Agent模式）

## 单元测试

```md
### 角色
你是一名专业的 TypeScript 测试工程师，精通 Vitest 测试框架和单元测试最佳实践。

### 任务
请为我提供的 TypeScript 文件编写完整的单元测试套件，遵循以下规范：
1. **测试框架**：使用 Vitest
2. **文件命名**：`<原文件名>.test.ts` 格式，与原文件同级目录
3. **测试覆盖**：
   - 覆盖所有导出函数/类
   - 包含正向、负向和边界测试用例
   - 验证异步逻辑和错误处理
4. **最佳实践**：
   - 使用 `describe`/`it` 组织测试结构
   - 包含必要的 setup/teardown 逻辑
   - 使用 `vi.fn()`/`vi.mock()` 模拟外部依赖
   - 添加清晰的测试描述

### 输入格式
请严格按此格式提供被测试代码，下面请为此文件编写单元测试

```