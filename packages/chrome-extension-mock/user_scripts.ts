export default class MockUserScripts {
  // ---- Types ----
  public static ExecutionWorld = {
    MAIN: "MAIN",
    USER_SCRIPT: "USER_SCRIPT",
  } as const;

  public scripts: any[] = [];
  public worlds: any[] = [];

  // ---- configureWorld ----
  configureWorld(properties: any): Promise<void>;
  configureWorld(properties: any, callback: () => void): void;
  configureWorld(properties: any, callback?: () => void): Promise<void> | void {
    // console.log("configureWorld called with:", properties);
    this.worlds.push(properties);
    if (callback) callback();
    else return Promise.resolve();
  }

  // ---- getScripts ----
  getScripts(filter?: any): Promise<any[]>;
  getScripts(filter: any, callback: (scripts: any[]) => void): void;
  getScripts(filter?: any, callback?: (scripts: any[]) => void): Promise<any[]> | void {
    // console.log("getScripts called with:", filter);
    let result = this.scripts;
    if (filter?.ids) {
      result = this.scripts.filter((s) => filter.ids.includes(s.id));
    }
    if (callback) callback(result);
    else return Promise.resolve(result);
  }

  // ---- getWorldConfigurations ----
  getWorldConfigurations(): Promise<any[]>;
  getWorldConfigurations(callback: (worlds: any[]) => void): void;
  getWorldConfigurations(callback?: (worlds: any[]) => void): Promise<any[]> | void {
    // console.log("getWorldConfigurations called");
    if (callback) callback(this.worlds);
    else return Promise.resolve(this.worlds);
  }

  // ---- execute ----
  execute(injection: any): Promise<any[]>;
  execute(injection: any, callback: (result: any[]) => void): void;
  execute(injection: any, callback?: (result: any[]) => void): Promise<any[]> | void {
    // console.log("execute called with:", injection);
    const result = {
      documentId: "dummy-doc-id",
      frameId: injection.target.frameIds?.[0] ?? 0,
      result: "dummy-result",
    };
    if (callback) callback([result]);
    else return Promise.resolve([result]);
  }

  // ---- register ----
  register(scripts: any[]): Promise<void>;
  register(scripts: any[], callback: () => void): void;
  register(scripts: any[], callback?: () => void): Promise<void> | void {
    // console.log("register called with:", scripts);
    this.scripts.push(...scripts);
    if (callback) callback();
    else return Promise.resolve();
  }

  // ---- resetWorldConfiguration ----
  resetWorldConfiguration(worldId?: string): Promise<void>;
  resetWorldConfiguration(worldId: string, callback: () => void): void;
  resetWorldConfiguration(callback: () => void): void;
  resetWorldConfiguration(arg1?: string | (() => void), arg2?: () => void): Promise<void> | void {
    // console.log("resetWorldConfiguration called with:", arg1);
    if (typeof arg1 === "string") {
      this.worlds = this.worlds.filter((w) => w.worldId !== arg1);
      if (arg2) arg2();
      else return Promise.resolve();
    } else if (typeof arg1 === "function") {
      this.worlds = [];
      arg1();
    } else {
      this.worlds = [];
      return Promise.resolve();
    }
  }

  // ---- unregister ----
  unregister(filter?: any): Promise<void>;
  unregister(filter: any, callback: () => void): void;
  unregister(filter?: any, callback?: () => void): Promise<void> | void {
    // console.log("unregister called with:", filter);
    if (filter?.ids) {
      this.scripts = this.scripts.filter((s) => !filter.ids.includes(s.id));
    } else {
      this.scripts = [];
    }
    if (callback) callback();
    else return Promise.resolve();
  }

  // ---- update ----
  update(scripts: any[]): Promise<void>;
  update(scripts: any[], callback: () => void): void;
  update(scripts: any[], callback?: () => void): Promise<void> | void {
    // console.log("update called with:", scripts);
    for (const updated of scripts) {
      const idx = this.scripts.findIndex((s) => s.id === updated.id);
      if (idx !== -1) {
        this.scripts[idx] = { ...this.scripts[idx], ...updated };
      }
    }
    if (callback) callback();
    else return Promise.resolve();
  }

  // ---- helper for tests ----
  resetMock(): void {
    this.scripts = [];
    this.worlds = [];
  }
}
