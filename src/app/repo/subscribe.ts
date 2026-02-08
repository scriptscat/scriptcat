import { Repo } from "./repo";
import type { SCMetadata } from "./metadata";

export { SCMetadata };

export const SubscribeStatusType = {
  enable: 1, // 启动 checkSubscribeUpdate
  disable: 2, // 停用 checkSubscribeUpdate
  unknown3: 3, // 3 是什么？
  unknown4: 4, // 4 是什么？
} as const;

export type SubscribeStatusType = ValueOf<typeof SubscribeStatusType>;

export interface SubscribeScript {
  uuid: string;
  url: string; // url of the user.js
}

export interface Subscribe {
  url: string; // url of the user.sub.js; 作为唯一键。暂时只支持网址。（ 如需要支持 手动生成 Subscribe，日后可升级成 url / uuid ）
  name: string;
  code: string; // (meta) code of the user.sub.js
  author: string;
  scripts: Record<string, SubscribeScript>; // 这里只储存脚本的 uuid 和 url 等资讯，而不是实际的代码
  metadata: SCMetadata;
  status: SubscribeStatusType; // 表示启动或停用。 3 和 4 不详
  createtime: number;
  updatetime?: number;
  checktime: number;
}

export class SubscribeDAO extends Repo<Subscribe> {
  constructor() {
    super("subscribe");
  }

  public save(val: Subscribe) {
    return super._save(val.url, val);
  }
}
