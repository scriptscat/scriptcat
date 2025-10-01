import { Repo } from "./repo";
import { v5 as uuidv5 } from "uuid";

export type ResourceType = "require" | "require-css" | "resource";

export interface Resource {
  url: string; // key
  content: string;
  base64: string;
  hash: ResourceHash;
  type: ResourceType;
  link: { [key: string]: boolean }; // 关联的脚本
  contentType: string;
  createtime: number;
  updatetime?: number;
}

export interface ResourceHash {
  md5: string;
  sha1: string;
  sha256: string;
  sha384: string;
  sha512: string;
  integrity?: {
    md5: string;
    sha1: string;
    sha256: string;
    sha384: string;
    sha512: string;
  };
}

export interface CompliedResource {
  uuid: string;
  storeCode: string;
  matches: string[]; // primary
  includeGlobs: string[]; // includeGlobs applied after matches
  excludeMatches: string[];
  excludeGlobs: string[];
  allFrames: boolean;
  world: string;
  runAt: string;
}

export const ResourceNamespace = "76f45084-91b1-42c1-8be8-cbcc54b171f0";

export class ResourceDAO extends Repo<Resource> {
  constructor() {
    super("resource");
  }

  protected joinKey(key: string) {
    return this.prefix + uuidv5(key, ResourceNamespace);
  }

  save(resource: Resource) {
    return super._save(resource.url, resource);
  }
}

// SC代码更新时，建议修改 CompliedResourceNamespace 以删除旧Cache
export const CompliedResourceNamespace = "200bf956-5afc-480a-8d69-300f07754bf2";

export class CompliedResourceDAO extends Repo<CompliedResource> {
  constructor() {
    super(`complied_resource`);
  }

  protected joinKey(key: string) {
    return this.prefix + key;
  }

  save(resource: CompliedResource) {
    return super._save(resource.uuid, resource);
  }
}

export const cleanInvalidCompliedResources = async () => {
  const storedKey = (await chrome.storage.local.get("complied_resource_key"))["complied_resource_key"];
  if (storedKey === CompliedResourceNamespace) return;
  const invalidKeys = await new Promise<string[]>((resolve) => {
    chrome.storage.local.get((result: Partial<Record<string, any>> | undefined) => {
      const lastError = chrome.runtime.lastError;
      if (lastError) {
        console.error("chrome.runtime.lastError in chrome.storage.local.get:", lastError);
        // 无视storage API错误，继续执行
      }
      if (result) {
        resolve(
          Object.keys(result).filter(
            (key) => key.startsWith("complied_resource:") || key.startsWith("complied_resource##")
          )
        );
      }
      resolve([] as string[]);
    });
  });
  await chrome.storage.local.remove(invalidKeys);
  await chrome.storage.local.set({ complied_resource_key: CompliedResourceNamespace });
};
