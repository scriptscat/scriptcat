// gm api 权限验证
import type { Script } from "@App/app/repo/scripts";
import { type Permission, PermissionDAO } from "@App/app/repo/permission";
import type { GetSender } from "@Packages/message/server";
import { type Group } from "@Packages/message/server";
import { type MessageQueue } from "@Packages/message/message_queue";
import type { Api, Request } from "./types";
import Cache from "@App/app/cache";
import CacheKey from "@App/app/cache_key";
import { v4 as uuidv4 } from "uuid";
import Queue from "@App/pkg/utils/queue";
import { subscribeScriptDelete } from "../queue";

export interface ConfirmParam {
  // 权限名
  permission: string;
  // 权限值
  permissionValue?: string;
  // 确认权限标题
  title?: string;
  // 权限详情内容
  metadata?: { [key: string]: string };
  // 权限描述
  describe?: string;
  // 是否通配
  wildcard?: boolean;
  // 权限内容
  permissionContent?: string;
}

export interface UserConfirm {
  allow: boolean;
  type: number; // 1: 允许一次 2: 临时允许全部 3: 临时允许此 4: 永久允许全部 5: 永久允许此
}

export type ApiParamConfirmFn = (request: Request) => Promise<boolean | ConfirmParam>;

export interface ApiParam {
  // 默认提供的函数
  default?: boolean;
  // 是否只有后台环境中才能执行
  background?: boolean;
  // 是否需要弹出页面让用户进行确认
  confirm?: ApiParamConfirmFn;
  // 别名
  alias?: string[];
  // 关联
  link?: string[];
  // 兼容GM.*
  dotAlias?: boolean;
}

export interface ApiValue {
  api: Api;
  param: ApiParam;
}

const apis: Map<string, ApiValue> = new Map();

export function PermissionVerifyApiGet(name: string): ApiValue | undefined {
  return apis.get(name);
}

function PermissionVerifyApiSet(key: string, api: any, param: ApiParam): void {
  apis.set(key, { api, param });
}

export default class PermissionVerify {
  public static API(param: ApiParam = {}) {
    if (param.dotAlias === undefined) {
      param.dotAlias = true; // 预设兼容GM.*
    }
    return (target: any, propertyName: string, descriptor: PropertyDescriptor) => {
      const key = propertyName;
      PermissionVerifyApiSet(key, descriptor.value, param);
      // 兼容GM.*
      if (param.dotAlias && key.includes("GM_")) {
        const dot = key.replace("GM_", "GM.");
        if (param.alias) {
          param.alias.push(dot);
        } else {
          param.alias = [dot];
        }
      }

      // 处理别名
      if (param.alias) {
        for (const alias of param.alias) {
          PermissionVerifyApiSet(alias, descriptor.value, param);
        }
      }
    };
  }

  // 确认队列
  confirmQueue: Queue<{
    request: Request;
    confirm: ConfirmParam | boolean;
    resolve: (value: boolean) => void;
    reject: (reason: any) => void;
    sender: GetSender;
  }> = new Queue();

  private permissionDAO: PermissionDAO = new PermissionDAO();

  constructor(
    private group: Group,
    private mq: MessageQueue
  ) {
    this.permissionDAO.enableCache();
  }

  // 验证是否有权限
  async verify(request: Request, api: ApiValue, sender: GetSender): Promise<boolean> {
    const { alias, link, confirm } = api.param;
    if (api.param.default) {
      return true;
    }
    // 没有其它条件,从metadata.grant中判断
    const { grant } = request.script.metadata;
    if (!grant) {
      throw new Error("grant is undefined");
    }
    for (let i = 0; i < grant.length; i += 1) {
      const grantName = grant[i];
      if (
        // 名称相等
        grantName === request.api ||
        // 别名相等
        (alias && alias.includes(grantName)) ||
        // 关联包含
        (link && link.includes(grantName))
      ) {
        // 需要用户确认
        let result = true;
        if (confirm) {
          result = await this.pushConfirmQueue(request, confirm, sender);
        }
        return result;
      }
    }
    throw new Error("permission not requested");
  }

  async dealConfirmQueue() {
    // 处理确认队列
    const data = await this.confirmQueue.pop();
    if (!data) {
      this.dealConfirmQueue();
      return;
    }
    try {
      const ret = await this.confirm(data.request, data.confirm, data.sender);
      data.resolve(ret);
    } catch (e) {
      data.reject(e);
    }
    this.dealConfirmQueue();
  }

  // 确认队列,为了防止一次性打开过多的窗口
  async pushConfirmQueue(request: Request, confirmFn: ApiParamConfirmFn, sender: GetSender): Promise<boolean> {
    const confirm = await confirmFn(request);
    if (confirm === true) {
      return true;
    }
    return await new Promise((resolve, reject) => {
      this.confirmQueue.push({ request, confirm, resolve, reject, sender });
    });
  }

  async confirm(request: Request, confirm: boolean | ConfirmParam, sender: GetSender): Promise<boolean> {
    if (typeof confirm === "boolean") {
      return confirm;
    }
    const cacheKey = CacheKey.permissionConfirm(request.script.uuid, confirm);
    // 从数据库中查询是否有此权限
    const ret = await Cache.getInstance().getOrSet(cacheKey, async () => {
      let model = await this.permissionDAO.findByKey(request.uuid, confirm.permission, confirm.permissionValue || "");
      if (!model) {
        // 允许通配
        if (confirm.wildcard) {
          model = await this.permissionDAO.findByKey(request.uuid, confirm.permission, "*");
        }
      }
      return model;
    });
    // 有查询到结果,进入判断,不再需要用户确认
    if (ret) {
      if (ret.allow) {
        return true;
      }
      // 权限拒绝
      throw new Error("permission denied");
    }
    // 没有权限,则弹出页面让用户进行确认
    const userConfirm = await this.confirmWindow(request.script, confirm, sender);
    // 成功存入数据库
    const model: Permission = {
      uuid: request.uuid,
      permission: confirm.permission,
      permissionValue: "",
      allow: userConfirm.allow,
      createtime: Date.now(),
      updatetime: 0,
    };
    switch (userConfirm.type) {
      case 4:
      case 2: {
        // 通配
        model.permissionValue = "*";
        break;
      }
      case 5:
      case 3: {
        model.permissionValue = confirm.permissionValue || "";
        break;
      }
      default:
        break;
    }
    // 临时 放入缓存
    if (userConfirm.type >= 2) {
      Cache.getInstance().set(cacheKey, model);
    }
    // 总是 放入数据库
    if (userConfirm.type >= 4) {
      const oldConfirm = await this.permissionDAO.findByKey(request.uuid, model.permission, model.permissionValue);
      if (!oldConfirm) {
        await this.permissionDAO.save(model);
      } else {
        await this.permissionDAO.update(this.permissionDAO.key(model), model);
      }
    }
    if (userConfirm.allow) {
      return true;
    }
    throw new Error("permission not allowed");
  }

  // 确认map
  confirmMap: Map<
    string,
    {
      confirm: ConfirmParam;
      script: Script;
      resolve: (value: UserConfirm) => void;
      reject: (reason: any) => void;
    }
  > = new Map();

  // 弹出窗口让用户进行确认
  async confirmWindow(script: Script, confirm: ConfirmParam, sender: GetSender): Promise<UserConfirm> {
    return new Promise((resolve, reject) => {
      const uuid = uuidv4();
      // 超时处理
      const timeout = setTimeout(() => {
        this.confirmMap.delete(uuid);
        reject(new Error("permission confirm timeout"));
      }, 40 * 1000);
      // 保存到map中
      this.confirmMap.set(uuid, {
        confirm,
        script,
        resolve: (value: UserConfirm) => {
          clearTimeout(timeout);
          resolve(value);
        },
        reject,
      });
      // 打开窗口
      const { tabId, windowId } = sender.getExtMessageSender();
      chrome.tabs.create({
        url: chrome.runtime.getURL(`src/confirm.html?uuid=${uuid}`),
        openerTabId: tabId === -1 ? undefined : tabId, // 如果是后台脚本,则不设置openerTabId
        windowId: windowId === -1 ? undefined : windowId, // 如果是后台脚本,则不设置windowId
      });
    });
  }

  // 处理确认
  private async userConfirm(data: { uuid: string; userConfirm: UserConfirm }) {
    const confirm = this.confirmMap.get(data.uuid);
    if (!confirm) {
      if (data.userConfirm.type === 0) {
        // 忽略
        return undefined;
      }
      throw new Error("confirm not found");
    }
    this.confirmMap.delete(data.uuid);
    confirm.resolve(data.userConfirm);
    return true;
  }

  // 获取信息
  private async getInfo(uuid: string) {
    const data = this.confirmMap.get(uuid);
    if (!data) {
      throw new Error("permission confirm not found");
    }
    const { script, confirm } = data;
    // 查询允许统配的有多少个相同等待确认权限
    let likeNum = 0;
    if (data.confirm.wildcard) {
      this.confirmQueue.list.forEach((value) => {
        const confirm = value.confirm as ConfirmParam;
        if (
          confirm.wildcard &&
          value.request.uuid === data.script.uuid &&
          confirm.permission === data.confirm.permission
        ) {
          likeNum += 1;
        }
      });
    }
    return { script, confirm, likeNum };
  }

  async deletePermission(data: { uuid: string; permission: string; permissionValue: string }) {
    const oldConfirm = await this.permissionDAO.findByKey(data.uuid, data.permission, data.permissionValue);
    if (!oldConfirm) {
      throw new Error("permission not found");
    }
    await this.permissionDAO.delete(this.permissionDAO.key(oldConfirm));
    this.clearCache(data.uuid);
  }

  getScriptPermissions(uuid: string) {
    // 获取脚本的所有权限
    return this.permissionDAO.find((key, item) => item.uuid === uuid);
  }

  // 添加权限
  async addPermission(permission: Permission) {
    await this.permissionDAO.save(permission);
    this.clearCache(permission.uuid);
  }

  // 更新权限
  async updatePermission(permission: Permission) {
    const key = this.permissionDAO.key(permission);
    const result = await this.permissionDAO.update(key, {
      allow: permission.allow,
      updatetime: Date.now(),
    });
    if (result) {
      this.clearCache(permission.uuid);
      return result;
    }
    throw new Error("permission not found");
  }

  // 重置权限
  async resetPermission(uuid: string) {
    // 删除所有权限
    const permissions = await this.permissionDAO.find((key, item) => item.uuid === uuid);
    permissions.forEach((item) => {
      this.permissionDAO.delete(this.permissionDAO.key(item));
    });
    this.clearCache(uuid);
  }

  async clearCache(uuid: string) {
    const keys = await Cache.getInstance().list();
    // 删除所有以permission:uuid:开头的缓存
    await Promise.all(
      keys.map((key) => {
        if (key.startsWith(`permission:${uuid}:`)) {
          return Cache.getInstance().del(key);
        }
      })
    );
  }

  init() {
    this.dealConfirmQueue();
    this.group.on("confirm", this.userConfirm.bind(this));
    this.group.on("getInfo", this.getInfo.bind(this));
    this.group.on("deletePermission", this.deletePermission.bind(this));
    this.group.on("getScriptPermissions", this.getScriptPermissions.bind(this));
    this.group.on("addPermission", this.addPermission.bind(this));
    this.group.on("updatePermission", this.updatePermission.bind(this));
    this.group.on("resetPermission", this.resetPermission.bind(this));

    subscribeScriptDelete(this.mq, (data) => {
      // 删除脚本的所有权限
      this.resetPermission(data.script.uuid);
    });
  }
}
