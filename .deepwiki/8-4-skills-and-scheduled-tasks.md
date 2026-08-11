# Skills and Scheduled Tasks

<details>
<summary>Relevant source files</summary>

The following files were used as context for generating this wiki page:

- [packages/filesystem/zip/rw.ts](../packages/filesystem/zip/rw.ts)
- [packages/filesystem/zip/zip.ts](../packages/filesystem/zip/zip.ts)
- [src/app/service/agent/core/compact_prompt.ts](../src/app/service/agent/core/compact_prompt.ts)
- [src/app/service/agent/core/sub_agent_types.ts](../src/app/service/agent/core/sub_agent_types.ts)
- [src/app/service/agent/core/system_prompt.test.ts](../src/app/service/agent/core/system_prompt.test.ts)
- [src/app/service/agent/core/system_prompt.ts](../src/app/service/agent/core/system_prompt.ts)
- [src/app/service/offscreen/gm_api.ts](../src/app/service/offscreen/gm_api.ts)
- [src/app/service/service_worker/clipboard.ts](../src/app/service/service_worker/clipboard.ts)
- [src/app/service/service_worker/types.ts](../src/app/service/service_worker/types.ts)
- [src/pkg/utils/jszip-x.ts](../src/pkg/utils/jszip-x.ts)
- [src/pkg/utils/skill.ts](../src/pkg/utils/skill.ts)
- [src/template/scriptcat.d.tpl](../src/template/scriptcat.d.tpl)
- [src/types/main.d.ts](../src/types/main.d.ts)
- [src/types/scriptcat.d.ts](../src/types/scriptcat.d.ts)

</details>



The Skill and Scheduled Task systems in ScriptCat extend the AI Agent's capabilities by providing a mechanism for packaging modular tools and executing autonomous operations based on time triggers. This infrastructure leverages the Origin Private File System (OPFS) for data persistence and a specialized error handling model to manage retry logic.

## 1. Skill System

Skills are modular extensions for the ScriptCat Agent, packaged as `.zip` files or directories containing a `SKILL.md` metadata file. They allow developers to define custom tools and prompts that the Agent can utilize during its orchestrator loop.

### 1.1 Packaging and Metadata (SKILL.md)
The core of a Skill is the `SKILL.md` file, which follows a structured format to define the Skill's name, version, description, and available tools. ScriptCat uses `ZipFileSystem` to handle Skill packages.

*   **Format**: A markdown file containing a YAML front-matter or structured sections.
*   **Packaging**: Skills are bundled into ZIP files using `JSZippZipFile` [src/pkg/utils/jszip-x.ts:77-144](../src/pkg/utils/jszip-x.ts#L77-L144).
*   **Storage**: Installed skills and their associated files are stored in the OPFS workspace, providing an isolated environment for the Agent [src/app/service/agent/core/system_prompt.ts:31-31](../src/app/service/agent/core/system_prompt.ts#L31-L31).

### 1.2 Skill Management Flow
The `SkillService` (implemented via `SkillManager`) handles the lifecycle of skills.

| Operation | Code Entity | Description |
| :--- | :--- | :--- |
| **Install** | `SkillService.install` | Validates the ZIP structure and extracts contents to OPFS. |
| **Update** | `SkillService.update` | Replaces existing skill files while maintaining configuration. |
| **List** | `SkillService.list` | Retrieves all installed skills for the Agent UI. |
| **Discovery** | `SkillService.getTools` | Extracts tool definitions to inject into the Agent's system prompt. |

**Sources:** [src/pkg/utils/jszip-x.ts:77-144](../src/pkg/utils/jszip-x.ts#L77-L144), [src/app/service/agent/core/system_prompt.ts:31-31](../src/app/service/agent/core/system_prompt.ts#L31-L31), [packages/filesystem/zip/zip.ts:6-66](../packages/filesystem/zip/zip.ts#L6-L66)

## 2. AgentTaskService and Scheduling

The `AgentTaskService` manages cron-based execution of Agent tasks. This allows the Agent to perform background automation without active user interaction.

### 2.1 Cron Scheduling
Tasks are scheduled using standard cron expressions. The `AgentTaskService` monitors these expressions and triggers the `AgentService` to initiate a session when a match occurs.

*   **Task Execution**: When a task triggers, the system initializes a `ToolLoopOrchestrator` with a specific `systemPrompt` that includes the task's objectives [src/app/service/agent/core/system_prompt.ts:15-27](../src/app/service/agent/core/system_prompt.ts#L15-L27).
*   **State Tracking**: Tasks use `create_task`, `update_task`, and `list_tasks` tools to maintain progress across multiple execution rounds [src/app/service/agent/core/sub_agent_types.ts:14-14](../src/app/service/agent/core/sub_agent_types.ts#L14-L14).

### 2.2 System Prompt Integration
Scheduled tasks are governed by the `SECTION_PLANNING` principles, which dictate that complex tasks must be analyzed and broken down into steps before execution [src/app/service/agent/core/system_prompt.ts:15-27](../src/app/service/agent/core/system_prompt.ts#L15-L27).

**Sources:** [src/app/service/agent/core/system_prompt.ts:15-27](../src/app/service/agent/core/system_prompt.ts#L15-L27), [src/app/service/agent/core/sub_agent_types.ts:14-14](../src/app/service/agent/core/sub_agent_types.ts#L14-L14)

## 3. Error Handling and Retries

ScriptCat implements a strict failure detection and retry policy to prevent the Agent from wasting LLM tokens on repetitive, failing actions.

### 3.1 CATRetryError and Failure Limits
The system distinguishes between transient errors and logic failures using specific rules:
1.  **First Failure**: The Agent is permitted to try one alternative approach (e.g., a different CSS selector) [src/app/service/agent/core/system_prompt.ts:47-47](../src/app/service/agent/core/system_prompt.ts#L47-L47).
2.  **Second Failure**: The system triggers a hard stop. The Agent must use `ask_user` to explain the failure and request intervention [src/app/service/agent/core/system_prompt.ts:48-48](../src/app/service/agent/core/system_prompt.ts#L48-L48).
3.  **Repetition Guard**: Calling the same tool with identical arguments twice is strictly forbidden [src/app/service/agent/core/system_prompt.ts:49-49](../src/app/service/agent/core/system_prompt.ts#L49-L49).

### 3.2 Resilience Diagram
This diagram maps the natural language "Retry Policy" to the code entities managing the tool loop.

**Agent Execution Resilience**
```mermaid
graph TD
    "AgentService" -- "Start Loop" --> "ToolLoopOrchestrator"
    "ToolLoopOrchestrator" -- "Execute" --> "ToolRegistry"
    "ToolRegistry" -- "Error Thrown" --> "FailureDetection"
    
    subgraph "FailureDetection [system_prompt.ts]"
        "1st_Fail"["1st Failure: Try Alternative"]
        "2nd_Fail"["2nd Failure: STOP & ask_user"]
        "Repetition"["Same Args: Blocked"]
    end
    
    "FailureDetection" -- "Analysis" --> "LLM_Context"
    "LLM_Context" -- "Retry Logic" --> "ToolLoopOrchestrator"
```
**Sources:** [src/app/service/agent/core/system_prompt.ts:42-60](../src/app/service/agent/core/system_prompt.ts#L42-L60)

## 4. OPFS Workspace

The Origin Private File System (OPFS) serves as the persistent workspace for the Agent and its Skills. It provides a standard filesystem API for storing logs, extracted data, and skill assets.

### 4.1 Workspace Structure
The workspace is managed by the Agent's file tools:
*   `opfs_read` / `opfs_write`: Basic I/O operations [src/app/service/agent/core/sub_agent_types.ts:28-29](../src/app/service/agent/core/sub_agent_types.ts#L28-L29).
*   `opfs_list` / `opfs_delete`: Directory and file management [src/app/service/agent/core/sub_agent_types.ts:30-31](../src/app/service/agent/core/sub_agent_types.ts#L30-L31).

### 4.2 Code Entity Mapping
The following diagram bridges the "Natural Language" file operations to the internal "Code Entities" that implement them.

**OPFS Workspace Entity Mapping**
```mermaid
graph LR
    subgraph "Natural Language Space"
        "Read File"
        "Write File"
        "Zip Skill"
    end

    subgraph "Code Entity Space"
        "opfs_read"["Tool: opfs_read"]
        "opfs_write"["Tool: opfs_write"]
        "ZipFS"["Class: ZipFileSystem"]
        "ZipRW"["Class: ZipFileReader/Writer"]
    end

    "Read File" --> "opfs_read"
    "Write File" --> "opfs_write"
    "Zip Skill" --> "ZipFS"
    "ZipFS" --> "ZipRW"
```

**Sources:** [src/app/service/agent/core/sub_agent_types.ts:17-50](../src/app/service/agent/core/sub_agent_types.ts#L17-L50), [packages/filesystem/zip/zip.ts:1-66](../packages/filesystem/zip/zip.ts#L1-L66), [packages/filesystem/zip/rw.ts:4-40](../packages/filesystem/zip/rw.ts#L4-L40)

## 5. Sub-Agent Delegation

For scheduled tasks and complex skills, the Agent delegates work to specialized sub-agents.

| Sub-Agent Type | Description | Allowed Tools |
| :--- | :--- | :--- |
| `researcher` | Web search and info gathering. | `web_search`, `web_fetch`, `get_tab_content` [src/app/service/agent/core/sub_agent_types.ts:18-32](../src/app/service/agent/core/sub_agent_types.ts#L18-L32) |
| `page_operator` | DOM interaction and automation. | `execute_script`, `activate_tab`, `open_tab` [src/app/service/agent/core/sub_agent_types.ts:52-67](../src/app/service/agent/core/sub_agent_types.ts#L52-L67) |
| `general` | General purpose with no delegation. | All tools except `ask_user` and `agent` [src/app/service/agent/core/sub_agent_types.ts:85-90](../src/app/service/agent/core/sub_agent_types.ts#L85-L90) |

**Sources:** [src/app/service/agent/core/sub_agent_types.ts:1-133](../src/app/service/agent/core/sub_agent_types.ts#L1-L133)

---
