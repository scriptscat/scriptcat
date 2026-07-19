# Data layer (backend taxonomy)

## The Data Layer

Persistence in `src/app/repo/` is **not one generic base class** — it's a small taxonomy of backends, each
suited to a different shape of data. Pick by matching an existing entity with the same size/query/lifecycle
needs (see [Adding an entity](#adding-an-entity) below), not by defaulting to `Repo<T>` for everything:

| Backend | Backs | Use for | Base file |
| --- | --- | --- | --- |
| `Repo<T>` | `chrome.storage.local` | Small config/metadata objects, optionally cached in memory | [`repo.ts`](../../src/app/repo/repo.ts) |
| `DAO<T>` | Dexie (IndexedDB) | Data needing indexed queries (`where`/pagination) | [`dao.ts`](../../src/app/repo/dao.ts) |
| `OPFSRepo` | Origin Private File System | Larger JSON blobs / files that don't fit a key-value store (Agent chat history, skills) | [`opfs_repo.ts`](../../src/app/repo/opfs_repo.ts) |
| Custom repository | Purpose-built | Only when none of the above fit (e.g. `TrashScriptDAO`) | e.g. [`trash_script.ts`](../../src/app/repo/trash_script.ts) |

### `Repo<T>`

### `Repo<T>`

```ts
export abstract class Repo<T> {
  useCache = false;
  constructor(protected prefix: string) {
    if (!prefix.endsWith(":")) this.prefix += ":";   // every key is "<prefix>:<key>"
  }
  enableCache() { this.useCache = true; }            // load-once, serve from memory
  protected joinKey(key: string) { return this.prefix + key; }
  protected _save(key, val): Promise<T> { /* cache or storage */ }
  get(key): Promise<T | undefined>;
  gets(keys): Promise<(T | undefined)[]>;
  getRecord(keys): Promise<Partial<Record<string, T>>>;
  find(filter?): Promise<T[]>;  findOne(filter?): Promise<T | undefined>;  all(): Promise<T[]>;
  update(key, val): Promise<T | false>;  updates(keys, val);
  delete(key): Promise<void>;  deletes(keys): Promise<void>;
}
```

Design notes:

- **Key scheme:** entities are stored under `"<prefix>:<key>"` so a single `chrome.storage.local` namespace
  holds every entity type without collisions. `find`/`all` scan the prefix.
- **Cache:** `enableCache()` switches reads/writes to a process-local cache that mirrors storage — used for
  hot collections (scripts) to avoid repeated async reads. A subclass that overrides `joinKey` can hash keys
  (e.g. resources keyed by URL via a UUID-v5 namespace).
- **Storage errors are logged, not thrown** — `chrome.runtime.lastError` is checked and reads continue, since
  a transient storage hiccup should not crash the worker.

### Repository inventory

Names ending in `DAO` don't all share one base class — check which backend before copying a pattern.

**`Repo<T>` (`chrome.storage.local`)**

| Repo | File | Entity | Notes |
|---|---|---|---|
| `ScriptDAO` | [`scripts.ts`](../../src/app/repo/scripts.ts) | `Script` (metadata) | Cached; companion `ScriptCodeDAO` stores source separately to keep metadata reads small; dedup via `searchExistingScript` |
| `ValueDAO` | [`value.ts`](../../src/app/repo/value.ts) | `Value` (GM storage) | Keyed by storage name (per-script or shared `@storageName`) |
| `ResourceDAO` | [`resource.ts`](../../src/app/repo/resource.ts) | `Resource` (`@require`/`@resource`) | Overrides `joinKey` to hash URLs; `CompiledResourceDAO` caches compiled deps with a version namespace |
| `PermissionDAO` | [`permission.ts`](../../src/app/repo/permission.ts) | `Permission` | Composite key `<uuid>:<permission>:<value>` |
| `SubscribeDAO` | [`subscribe.ts`](../../src/app/repo/subscribe.ts) | `Subscribe` | Keyed by feed URL |
| `FaviconDAO`, `LocalStorageDAO`, `ExportDAO`, `TempStorageDAO` | `src/app/repo/*.ts` | misc | Same `Repo<T>` pattern |
| `AgentModelRepo` | [`agent_model.ts`](../../src/app/repo/agent_model.ts) | `AgentModelConfig` | Agent model configs — small, no indexed query need |
| `AgentTaskRepo` | [`agent_task.ts`](../../src/app/repo/agent_task.ts) | `AgentTask` | Scheduled agent task definitions |
| `MCPServerRepo` | [`mcp_server_repo.ts`](../../src/app/repo/mcp_server_repo.ts) | `MCPServerConfig` | MCP server configs |

**`DAO<T>` (Dexie/IndexedDB)**

| DAO | File | Entity | Notes |
|---|---|---|---|
| `LoggerDAO` | [`logger.ts`](../../src/app/repo/logger.ts) | `Logger` | Logs need indexed queries (`where`/pagination) that `Repo<T>`'s prefix scan doesn't give you |

**`OPFSRepo` (Origin Private File System)**

| Repo | File | Entity | Notes |
|---|---|---|---|
| `AgentChatRepo` | [`agent_chat.ts`](../../src/app/repo/agent_chat.ts) | conversation metadata + messages | Can grow large and holds attachments; stored under `agents/conversations/` |
| `AgentTaskRunRepo` | [`agent_task.ts`](../../src/app/repo/agent_task.ts) | task run history | Companion to `AgentTaskRepo` for run records |
| `SkillRepo` | [`skill_repo.ts`](../../src/app/repo/skill_repo.ts) | skill `.md`/script bundles | Stored under `agents/skills/` |

**Custom repository (neither of the above fits)**

| Repo | File | Notes |
|---|---|---|
| `TrashScriptDAO` | [`trash_script.ts`](../../src/app/repo/trash_script.ts) | Purpose-built for the trash/restore flow; doesn't extend `Repo<T>` or `DAO<T>` |

This list is a snapshot — for the current exact set, run `git grep -n -E 'class [A-Za-z0-9_]*(DAO|Repo)' --
src/app/repo`.

### Adding an entity

Don't default to `Repo<T>`. Decide by the same questions the existing choices above answer:

- **Data size and shape** — small config object → `Repo<T>`; larger blob/file-like data → `OPFSRepo`.
- **Query pattern** — need indexed `where`/pagination queries → `DAO<T>` (Dexie); simple get/set/prefix-scan →
  `Repo<T>`.
- **Lifecycle** — matches an existing entity's access pattern closely → copy that entity's backend, not a
  generic template.

Only once you've picked `Repo<T>` (the common case for small config-shaped entities) does this shape apply:

```ts
export interface MyEntity { id: string; data: Record<string, unknown>; createtime: number; }

export class MyEntityDAO extends Repo<MyEntity> {
  constructor() { super("myentity"); }            // → keys "myentity:<id>"
  save(e: MyEntity) { return this._save(e.id, e); }
  findById(id: string) { return this.get(id); }
}
```

Then create it in the manager (`enableCache()` if hot), and expose operations via `group.on(...)`. For `DAO<T>`
or `OPFSRepo`, follow the nearest existing entity of that backend instead (e.g. `LoggerDAO` for Dexie,
`AgentChatRepo`/`SkillRepo` for OPFS) — their construction and access patterns differ from `Repo<T>`.
