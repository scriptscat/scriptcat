# External Access

<details>
<summary>Relevant source files</summary>

The following files were used as context for generating this wiki page:

- [src/app/service/queue.ts](../src/app/service/queue.ts)
- [src/app/service/service_worker/client.ts](../src/app/service/service_worker/client.ts)
- [src/app/service/service_worker/index.ts](../src/app/service/service_worker/index.ts)
- [src/app/service/service_worker/popup.ts](../src/app/service/service_worker/popup.ts)
- [src/app/service/service_worker/runtime.ts](../src/app/service/service_worker/runtime.ts)
- [src/app/service/service_worker/script.ts](../src/app/service/service_worker/script.ts)
- [src/app/service/service_worker/system.ts](../src/app/service/service_worker/system.ts)
- [src/locales/de-DE/settings.json](../src/locales/de-DE/settings.json)
- [src/locales/en-US/settings.json](../src/locales/en-US/settings.json)
- [src/locales/ja-JP/settings.json](../src/locales/ja-JP/settings.json)
- [src/locales/ko-KR/settings.json](../src/locales/ko-KR/settings.json)
- [src/locales/pt-BR/settings.json](../src/locales/pt-BR/settings.json)
- [src/locales/ru-RU/settings.json](../src/locales/ru-RU/settings.json)
- [src/locales/tr-TR/settings.json](../src/locales/tr-TR/settings.json)
- [src/locales/vi-VN/settings.json](../src/locales/vi-VN/settings.json)
- [src/locales/zh-CN/settings.json](../src/locales/zh-CN/settings.json)
- [src/locales/zh-TW/settings.json](../src/locales/zh-TW/settings.json)
- [src/pages/batchupdate.html](../src/pages/batchupdate.html)
- [src/pages/batchupdate/components.tsx](../src/pages/batchupdate/components.tsx)
- [src/pages/batchupdate/mobile.tsx](../src/pages/batchupdate/mobile.tsx)
- [src/pages/confirm.html](../src/pages/confirm.html)
- [src/pages/external_access_confirm.html](../src/pages/external_access_confirm.html)
- [src/pages/external_access_confirm/App.test.tsx](../src/pages/external_access_confirm/App.test.tsx)
- [src/pages/external_access_confirm/App.tsx](../src/pages/external_access_confirm/App.tsx)
- [src/pages/import.html](../src/pages/import.html)
- [src/pages/options/components/SettingRow.tsx](../src/pages/options/components/SettingRow.tsx)
- [src/pages/options/routes/Setting/sections/InterfaceSection.test.tsx](../src/pages/options/routes/Setting/sections/InterfaceSection.test.tsx)
- [src/pages/options/routes/Setting/sections/InterfaceSection.tsx](../src/pages/options/routes/Setting/sections/InterfaceSection.tsx)
- [src/pages/store/features/script.ts](../src/pages/store/features/script.ts)
- [src/pkg/config/config.ts](../src/pkg/config/config.ts)

</details>



The External Access subsystem provides a secure communication channel for external tools, such as Command Line Interfaces (CLI), Model Context Protocol (MCP) clients, and AI agents, to interact with ScriptCat. This interaction is facilitated through a WebSocket-based bridge, governed by strict security policies and manual user approval workflows.

## Architecture Overview

The subsystem is built on a layered architecture that separates the transport layer (WebSocket) from the logic layer (Bridge) and the security layer (Approval Service). Due to browser extension limitations, the WebSocket server resides in an offscreen document, while the logic is managed within the Service Worker.

### External Access Components Relationship
The following diagram illustrates how external requests flow through the system.

```mermaid
graph TD
    subgraph "External Tool Space"
        [CLI_Client]
        [MCP_Client]
    end

    subgraph "Offscreen Context"
        [ExternalAccessConnectClient]
    end

    subgraph "Service Worker Context"
        [ExternalAccessController]
        [ExternalAccessBridge]
        [ExternalAccessApprovalService]
        [ExternalAccessUIService]
    end

    subgraph "Persistence Layer"
        [ScriptDAO]
        [ScriptCodeDAO]
        [SystemConfig]
    end

    [CLI_Client] <--> |"WebSocket"| [ExternalAccessConnectClient]
    [ExternalAccessConnectClient] <--> |"ExtensionMessage"| [ExternalAccessController]
    [ExternalAccessController] --> [ExternalAccessBridge]
    [ExternalAccessBridge] --> [ExternalAccessApprovalService]
    [ExternalAccessApprovalService] --> [ExternalAccessUIService]
    [ExternalAccessUIService] -.-> |"UI Confirmation"| [external_access_confirm.html]
    [ExternalAccessBridge] --> [ScriptDAO]
    [ExternalAccessBridge] --> [ScriptCodeDAO]
    [ExternalAccessController] --> [SystemConfig]

    Sources: [src/app/service/service_worker/index.ts:166-189](), [src/app/service/service_worker/external_access/bridge.ts:31-33]()
```

## Session and Connection Management

Connections are managed by the `ExternalAccessController`. For security, the WebSocket bridge is disabled by default and must be explicitly enabled in the settings via the `external_access_enabled` config [src/app/service/service_worker/index.ts:166-168](../src/app/service/service_worker/index.ts#L166-L168).

### Pairing Mechanism
For long-term secure access (specifically for MCP clients), ScriptCat uses a pairing mechanism.
*   **Pairing Data**: Stores a shared secret `key` (hex string) and a `clientId` [src/pkg/config/config.ts:48-53](../src/pkg/config/config.ts#L48-L53).
*   **Storage**: This data is stored exclusively in `chrome.storage.local` and is never synced across devices to prevent credential leakage [src/pkg/config/config.ts:49-49](../src/pkg/config/config.ts#L49-L49).

## Security and Approval Policies

ScriptCat implements a granular policy system to control external interactions. Policies are divided into "Write" operations (install, delete, enable) and "Source Read" operations (reading script code).

### Policy Types
Defined in `src/pkg/config/config.ts`:
*   `ExternalAccessWritePolicy`: Controls operations like `install`, `update`, `delete`, `enable`, and `disable` [src/pkg/config/config.ts:45-45](../src/pkg/config/config.ts#L45-L45).
*   `ExternalAccessSourceReadPolicy`: Controls access to the raw source code of installed scripts [src/pkg/config/config.ts:46-46](../src/pkg/config/config.ts#L46-L46).

### Approval Modes
1.  **Approval (`approval`)**: The default mode. Every request triggers a UI confirmation dialog for the user [src/pkg/config/config.ts:43-47](../src/pkg/config/config.ts#L43-L47).
2.  **Allow (`allow`)**: Requests are executed automatically. To ensure user awareness, a system notification is dispatched via `notifyExternalAccessWrite` whenever a write operation occurs in this mode [src/app/service/service_worker/index.ts:39-56](../src/app/service/service_worker/index.ts#L39-L56).

Sources: [src/pkg/config/config.ts:43-53](../src/pkg/config/config.ts#L43-L53), [src/app/service/service_worker/index.ts:39-56](../src/app/service/service_worker/index.ts#L39-L56)

## Data Flow: External Request Execution

The `ExternalAccessBridge` acts as the primary orchestrator for external commands. It validates permissions before interacting with the `ScriptDAO` or `ScriptCodeDAO`.

### Request Lifecycle Diagram
This diagram maps the natural language request process to specific code entities.

```mermaid
sequenceDiagram
    participant Ext as "External Tool"
    participant Bridge as "ExternalAccessBridge"
    participant Policy as "SystemConfig Policy"
    participant Appr as "ExternalAccessApprovalService"
    participant UI as "external_access_confirm Page"
    participant DAO as "ScriptDAO / ScriptCodeDAO"

    Ext->>Bridge: "Request (e.g., scripts.get_code)"
    Bridge->>Policy: "check getExternalAccessSourceReadPolicy()"
    
    alt "Policy == approval"
        Bridge->>Appr: "requestApproval(req)"
        Appr->>UI: "Open Confirmation Tab"
        UI-->>Appr: "User Confirms"
        Appr-->>Bridge: "Approved"
    else "Policy == allow"
        Bridge->>Bridge: "Proceed"
    end

    Bridge->>DAO: "Execute Operation"
    DAO-->>Bridge: "Data Result"
    Bridge-->>Ext: "WebSocket Response"

    Sources: [src/app/service/service_worker/external_access/bridge.ts:31-33](), [src/app/service/service_worker/index.ts:169-177]()
```

## Confirmation UI (`external_access_confirm`)

When a request requires manual intervention, the `ExternalAccessUIService` opens the `external_access_confirm.html` page.

*   **Page Path**: `src/pages/external_access_confirm.html`
*   **Implementation**: `src/pages/external_access_confirm/App.tsx`
*   **Functionality**:
    *   Displays the details of the external request (e.g., which tool is requesting access, what script is being modified).
    *   Provides "Allow" and "Deny" actions.
    *   Handles the communication back to the `ExternalAccessApprovalService` to resume or terminate the pending request.

Sources: [src/app/service/service_worker/external_access/service.ts:35-35](../src/app/service/service_worker/external_access/service.ts#L35-L35), [src/pages/external_access_confirm/App.tsx:1-10](../src/pages/external_access_confirm/App.tsx#L1-L10)

## Configuration and I18n

External access settings are integrated into the standard ScriptCat settings panel under the "Security" section. Localization strings for these features are managed in the `settings.json` files for each supported locale.

| Key | Description |
| :--- | :--- |
| `external_access_enabled` | Master switch for the WebSocket server. |
| `external_access_write_policy` | Toggle between `approval` and `allow` for write tasks. |
| `external_access_source_read_policy` | Toggle between `approval` and `allow` for reading code. |

Sources: [src/pkg/config/config.ts:43-47](../src/pkg/config/config.ts#L43-L47), [src/locales/en-US/settings.json:48-50](../src/locales/en-US/settings.json#L48-L50)

---
