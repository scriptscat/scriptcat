declare namespace App {
  // window.external

  export type ExternalTampermonkey = {
    isInstalled(name: string, namespace: string, callback: (res: IsInstalledResponse | undefined) => unknown): void;
    getVersion?: (callback: (res: GetVersionResponse | undefined) => unknown) => unknown;
    openOptions?: (p1?: unknown, p2?: unknown) => unknown;
  };

  export type ExternalViolentmonkey = {
    isInstalled(name: string, namespace: string): Promise<unknown>;
  };

  // GreasyFork项目中FireMonkey扩展的脚本与样式管理机制解析
  // https://blog.csdn.net/gitblog_07112/article/details/148466939
  export type ExternalFireMonkey = {
    version: string;
  } & (
    | {
        installedScriptVersion: string;
      }
    | {
        installedStyleVersion: string;
      }
    | {
        installedCSSVersion: string;
      }
  )?;

  export type ExternalScriptCat = {
    isInstalled(name: string, namespace: string, callback: (res: IsInstalledResponse | undefined) => unknown): void;
  };

  export type IsInstalledResponse =
    | {
        installed: true;
        version: string | undefined;
      }
    | {
        installed: false;
      };

  export type GetVersionResponse = {
    version?: string;
    id?: string | undefined;
  };
}
