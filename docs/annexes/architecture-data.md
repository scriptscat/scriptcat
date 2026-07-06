# Data layer (Repo<T> + DAOs)

## The Data Layer (`Repo<T>` + DAOs)

Persistence is a thin generic over `chrome.storage.local` with an optional in-memory cache, in
[`src/app/repo/repo.ts`](../../src/app/repo/repo.ts).

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

### The DAOs

| DAO | File | Entity | Notes |
|---|---|---|---|
| `ScriptDAO` | [`scripts.ts`](../../src/app/repo/scripts.ts) | `Script` (metadata) | Cached; companion `ScriptCodeDAO` stores source separately to keep metadata reads small; dedup via `searchExistingScript` |
| `ValueDAO` | [`value.ts`](../../src/app/repo/value.ts) | `Value` (GM storage) | Keyed by storage name (per-script or shared `@storageName`) |
| `ResourceDAO` | [`resource.ts`](../../src/app/repo/resource.ts) | `Resource` (`@require`/`@resource`) | Overrides `joinKey` to hash URLs; `CompiledResourceDAO` caches compiled deps with a version namespace |
| `PermissionDAO` | [`permission.ts`](../../src/app/repo/permission.ts) | `Permission` | Composite key `<uuid>:<permission>:<value>` |
| `SubscribeDAO` | [`subscribe.ts`](../../src/app/repo/subscribe.ts) | `Subscribe` | Keyed by feed URL |
| `FaviconDAO`, `LocalStorageDAO`, `ExportDAO` | `src/app/repo/*.ts` | misc | Same `Repo<T>` pattern |
| `LoggerDAO` | [`logger.ts`](../../src/app/repo/logger.ts) | `Logger` | Extends `DAO<T>` (Dexie/IndexedDB), **not** `Repo<T>` — logs need indexed queries |

### Adding an entity is tiny

```ts
export interface MyEntity { id: string; data: Record<string, unknown>; createtime: number; }

export class MyEntityDAO extends Repo<MyEntity> {
  constructor() { super("myentity"); }            // → keys "myentity:<id>"
  save(e: MyEntity) { return this._save(e.id, e); }
  findById(id: string) { return this.get(id); }
}
```

Then create it in the manager (`enableCache()` if hot), and expose operations via `group.on(...)`.
