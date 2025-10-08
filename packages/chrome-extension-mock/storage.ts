// A simple, strongly-typed mock of chrome.storage.*
// - Promise and callback styles supported
// - set/remove/clear/getBytesInUse included
// - Per-area schemas supported

type Schema = Record<string, unknown>;

type Callback<T> = (arg: T) => void;

/**
 * Storage root with independent schemas per area (optional).
 * Usage:
 *   type Sync = { token: string; theme?: "light" | "dark" }
 *   type Local = { cache: string[] }
 *   const storage = new Storage<Sync, Local>();
 */
export default class Storage<
  TSync extends Schema = Schema,
  TLocal extends Schema = Schema,
  TSession extends Schema = Schema,
> {
  sync = new ChromeStorage<TSync>();
  local = new ChromeStorage<TLocal>();
  session = new ChromeStorage<TSession>();
}

class ChromeStorage<TSchema extends Schema = Schema> {
  private data: Partial<TSchema> = {};

  /** Narrow keys to strings; Chrome keys are string-ish. */
  private static isString(x: unknown): x is string {
    return typeof x === "string";
  }

  // ---------------------------
  // get() overloads (callbacks)
  // ---------------------------

  get(callback: Callback<Partial<TSchema>>): void;
  get(keys: null | undefined, callback: Callback<Partial<TSchema>>): void;

  /** Single key */
  get<K extends Extract<keyof TSchema, string>>(key: K, callback: Callback<Pick<TSchema, K>>): void;

  /** Multiple keys */
  get<K extends Extract<keyof TSchema, string>>(keys: K[], callback: Callback<Pick<TSchema, K>>): void;

  /** Defaults object: supplied keys are always present in result */
  get<K extends Extract<keyof TSchema, string>>(
    defaults: Partial<Record<K, TSchema[K]>>,
    callback: Callback<Pick<TSchema, K>>
  ): void;

  // -------------------------
  // get() overloads (Promise)
  // -------------------------

  get(): Promise<Partial<TSchema>>;
  get(keys: null | undefined): Promise<Partial<TSchema>>;
  get<K extends Extract<keyof TSchema, string>>(key: K): Promise<Pick<TSchema, K>>;
  get<K extends Extract<keyof TSchema, string>>(keys: K[]): Promise<Pick<TSchema, K>>;
  get<K extends Extract<keyof TSchema, string>>(defaults: Partial<Record<K, TSchema[K]>>): Promise<Pick<TSchema, K>>;

  // ----------------
  // get() impl
  // ----------------

  get<K extends Extract<keyof TSchema, string>>(
    arg1?:
      | null
      | undefined
      | K
      | K[]
      | Partial<Record<K, TSchema[K]>>
      | Callback<Pick<TSchema, K>>
      | Callback<Partial<TSchema>>,
    arg2?: Callback<Pick<TSchema, K>> | Callback<Partial<TSchema>>
  ): void | Promise<Partial<TSchema> | Pick<TSchema, K>> {
    // Promise style when no callback provided
    if (typeof arg1 !== "function" && typeof arg2 !== "function") {
      return new Promise((resolve) => {
        // Re-enter in callback style
        (this.get as any)(arg1, resolve);
      });
    }

    // Normalize params to (keys, callback)
    const callback = (typeof arg1 === "function" ? arg1 : arg2) as
      | Callback<Pick<TSchema, K>>
      | Callback<Partial<TSchema>>;

    const keys = (typeof arg1 === "function" ? null : arg1) as
      | null
      | undefined
      | K
      | K[]
      | Partial<Record<K, TSchema[K]>>;

    // 1) null/undefined -> entire (partial) schema
    if (keys == null) {
      (callback as Callback<Partial<TSchema>>)({ ...this.data } as Partial<TSchema>);
      return;
    }

    // 2) single key
    if (ChromeStorage.isString(keys)) {
      const k = keys as K;
      const out = { [k]: this.data[k as keyof TSchema] } as Pick<TSchema, K>;
      (callback as Callback<Pick<TSchema, K>>)(out);
      return;
    }

    // 3) array of keys
    if (Array.isArray(keys)) {
      const out = {} as Pick<TSchema, K>;
      for (const k of keys) {
        (out as any)[k] = this.data[k as keyof TSchema];
      }
      (callback as Callback<Pick<TSchema, K>>)(out);
      return;
    }

    // 4) defaults object
    {
      const defaults = keys as Partial<Record<K, TSchema[K]>>;
      const out: Partial<Record<K, TSchema[K]>> = { ...defaults };
      for (const k of Object.keys(defaults) as K[]) {
        const v = this.data[k as keyof TSchema];
        if (v !== undefined) out[k] = v as TSchema[K];
      }
      (callback as Callback<Pick<TSchema, K>>)(out as Pick<TSchema, K>);
      return;
    }
  }

  // ----------------
  // set()
  // ----------------

  set(items: Partial<TSchema>, callback: () => void): void;
  set(items: Partial<TSchema>): Promise<void>;
  set(items: Partial<TSchema>, callback?: () => void): void | Promise<void> {
    const apply = () => {
      Object.assign(this.data, items);
    };

    if (callback) {
      apply();
      callback();
      return;
    }
    return new Promise<void>((resolve) => {
      apply();
      resolve();
    });
  }

  // ----------------
  // remove()
  // ----------------

  remove(keys: Extract<keyof TSchema, string>, callback: () => void): void;
  remove(keys: Extract<keyof TSchema, string>[]): void;
  remove(keys: Extract<keyof TSchema, string>[]): Promise<void>;
  remove(keys: Extract<keyof TSchema, string>, callback?: () => void): void;
  remove(
    keys: Extract<keyof TSchema, string> | Extract<keyof TSchema, string>[],
    callback?: () => void
  ): void | Promise<void> {
    const ks = Array.isArray(keys) ? keys : [keys];
    const apply = () => {
      for (const k of ks) {
        delete (this.data as any)[k];
      }
    };

    if (callback) {
      apply();
      callback();
      return;
    }
    return new Promise<void>((resolve) => {
      apply();
      resolve();
    });
  }

  // ----------------
  // clear()
  // ----------------

  clear(callback: () => void): void;
  clear(): Promise<void>;
  clear(callback?: () => void): void | Promise<void> {
    const apply = () => {
      this.data = {};
    };
    if (callback) {
      apply();
      callback();
      return;
    }
    return new Promise<void>((resolve) => {
      apply();
      resolve();
    });
  }

  // ----------------
  // getBytesInUse()
  // ----------------

  getBytesInUse(callback: Callback<number>): void;
  getBytesInUse(keys: null | undefined, callback: Callback<number>): void;
  getBytesInUse<K extends Extract<keyof TSchema, string>>(key: K, callback: Callback<number>): void;
  getBytesInUse<K extends Extract<keyof TSchema, string>>(keys: K[], callback: Callback<number>): void;

  getBytesInUse(): Promise<number>;
  getBytesInUse(keys: null | undefined): Promise<number>;
  getBytesInUse<K extends Extract<keyof TSchema, string>>(key: K): Promise<number>;
  getBytesInUse<K extends Extract<keyof TSchema, string>>(keys: K[]): Promise<number>;

  getBytesInUse<K extends Extract<keyof TSchema, string>>(
    arg1?: null | undefined | K | K[] | Callback<number>,
    arg2?: Callback<number>
  ): void | Promise<number> {
    if (typeof arg1 !== "function" && typeof arg2 !== "function") {
      return new Promise((resolve) => (this.getBytesInUse as any)(arg1, resolve));
    }

    const callback = (typeof arg1 === "function" ? arg1 : arg2) as Callback<number>;
    const keys = typeof arg1 === "function" ? null : (arg1 as null | undefined | K | K[]);

    const subset = (): unknown => {
      if (keys == null) return this.data;
      if (ChromeStorage.isString(keys)) return { [keys]: this.data[keys as keyof TSchema] };
      if (Array.isArray(keys)) {
        const o: Partial<TSchema> = {};
        for (const k of keys) (o as any)[k] = this.data[k as keyof TSchema];
        return o;
      }
      return this.data;
    };

    const json = JSON.stringify(subset() ?? {});
    callback(new TextEncoder().encode(json).byteLength);
  }
}
