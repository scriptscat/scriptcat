// gm api 权限验证
import Cache from "@App/app/cache";
import { Permission, PermissionDAO } from "@App/app/repo/permission";
import { Script } from "@App/app/repo/scripts";
import CacheKey from "@App/pkg/utils/cache_key";
import { v4 as uuidv4 } from "uuid";
import MessageQueue from "@App/pkg/utils/message_queue";
import IoC from "@App/app/ioc";
import { MessageHander } from "@App/app/message/message";
import { Api, Request } from "./gm_api";

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

export interface ApiParam {
  // 默认提供的函数
  default?: boolean;
  // 是否只有后台环境中才能执行
  background?: boolean;
  // 是否需要弹出页面让用户进行确认
  confirm?: (request: Request) => Promise<boolean | ConfirmParam>;
  // 监听方法
  listener?: () => void;
  // 别名
  alias?: string[];
  // 关联
  link?: string;
}

export interface ApiValue {
  api: Api;
  param: ApiParam;
}

export interface IPermissionVerify {
  verify(request: Request, api: ApiValue): Promise<boolean>;
}

export default class PermissionVerify {
  static apis: Map<string, ApiValue> = new Map();

  static textarea: HTMLTextAreaElement = document.createElement("textarea");

  public static API(param: ApiParam = {}) {
    return (
      target: any,
      propertyName: string,
      descriptor: PropertyDescriptor
    ) => {
      const key = propertyName;
      if (param.listener) {
        param.listener();
      }
      PermissionVerify.apis.set(key, {
        api: descriptor.value,
        param,
      });
      // 兼容GM.*
      const dot = key.replace("_", ".");
      if (dot !== key) {
        PermissionVerify.apis.set(dot, {
          api: descriptor.value,
          param,
        });
        if (param.alias) {
          param.alias.push(dot);
        } else {
          param.alias = [dot];
        }
      }

      // 处理别名
      if (param.alias) {
        param.alias.forEach((alias) => {
          PermissionVerify.apis.set(alias, {
            api: descriptor.value,
            param,
          });
        });
      }
    };
  }

  permissionDAO: PermissionDAO;

  // 确认队列
  confirmQueue: MessageQueue<{
    request: Request;
    confirm: ConfirmParam | boolean;
    resolve: (value: boolean) => void;
    reject: (reason: any) => void;
  }> = new MessageQueue();

  removePermissionCache(scriptId: number) {
    // 先删除缓存
    Cache.getInstance()
      .list()
      .forEach((key) => {
        if (key.startsWith(`permission:${scriptId.toString()}:`)) {
          Cache.getInstance().del(key);
        }
      });
  }

  constructor() {
    this.permissionDAO = new PermissionDAO();
    // 监听用户确认消息
    const message = <MessageHander>IoC.instance(MessageHander);
    message.setHandler(
      "permissionConfirm",
      (_action, data: { uuid: string; userConfirm: UserConfirm }) => {
        const confirm = this.confirmMap.get(data.uuid);
        if (!confirm) {
          if (data.userConfirm.type === 0) {
            // 忽略
            return Promise.resolve(undefined);
          }
          return Promise.reject(new Error("confirm not found"));
        }
        this.confirmMap.delete(data.uuid);
        confirm.resolve(data.userConfirm);
        return Promise.resolve(true);
      }
    );
    // 监听获取用户确认消息
    message.setHandler("getConfirm", (_action, uuid: string) => {
      const data = this.confirmMap.get(uuid);
      if (!data) {
        return Promise.reject(new Error("uuid not found"));
      }
      // 查询允许统配的有多少个相同等待确认权限
      let likeNum = 0;
      if (data.confirm.wildcard) {
        this.confirmQueue.list.forEach((value) => {
          const confirm = value.confirm as ConfirmParam;
          if (
            confirm.wildcard &&
            value.request.scriptId === data.script.id &&
            confirm.permission === data.confirm.permission
          ) {
            likeNum += 1;
          }
        });
      }
      return Promise.resolve({
        script: data.script,
        confirm: data.confirm,
        likeNum,
      });
    });
    // 监听删除权限
    message.setHandler(
      "deletePermission",
      async (_action, data: { scriptId: number; confirm: ConfirmParam }) => {
        // 先删除缓存
        this.removePermissionCache(data.scriptId);
        //  再删除数据库
        const m = await this.permissionDAO.findOne({
          scriptId: data.scriptId,
          permission: data.confirm.permission,
          permissionValue: data.confirm.permissionValue || "",
        });
        if (!m) {
          return Promise.resolve(true);
        }
        await this.permissionDAO.delete(m.id);
        return Promise.resolve(true);
      }
    );
    // 监听添加权限
    message.setHandler(
      "addPermission",
      async (_action, data: { scriptId: number; permission: Permission }) => {
        // 先删除缓存
        this.removePermissionCache(data.scriptId);
        // 从数据库中查询是否有此权限
        const m = await this.permissionDAO.findOne({
          scriptId: data.scriptId,
          permission: data.permission.permission,
          permissionValue: data.permission.permissionValue || "",
        });
        if (!m) {
          // 没有添加
          await this.permissionDAO.save(data.permission);
          return Promise.resolve(true);
        }
        // 有则更新
        data.permission.id = m.id;
        data.permission.createtime = m.createtime;
        data.permission.updatetime = new Date().getTime();
        this.permissionDAO.update(m.id, data.permission);
        return Promise.resolve(true);
      }
    );
    // 监听重置权限
    message.setHandler(
      "resetPermission",
      async (_action, data: { scriptId: number }) => {
        // 先删除缓存
        this.removePermissionCache(data.scriptId);
        // 从数据库中查询是否有此权限
        await this.permissionDAO.delete({
          scriptId: data.scriptId,
        });
        return Promise.resolve(true);
      }
    );
    this.dealConfirmQueue();
  }

  // 验证是否有权限
  verify(request: Request, api: ApiValue): Promise<boolean> {
    if (api.param.default) {
      return Promise.resolve(true);
    }
    // 没有其它条件,从metadata.grant中判断
    const { grant } = request.script.metadata;
    if (!grant) {
      return Promise.reject(new Error("grant is undefined"));
    }
    for (let i = 0; i < grant.length; i += 1) {
      if (
        // 名称相等
        grant[i] === request.api ||
        // 别名相等
        (api.param.alias && api.param.alias.includes(grant[i])) ||
        // 有关联的
        grant[i] === api.param.link
      ) {
        // 需要用户确认
        if (api.param.confirm) {
          return this.pushConfirmQueue(request, api);
        }
        return Promise.resolve(true);
      }
    }
    return Promise.reject(new Error("permission not requested"));
  }

  async dealConfirmQueue() {
    // 处理确认队列
    const data = await this.confirmQueue.pop();
    if (!data) {
      this.dealConfirmQueue();
      return;
    }
    try {
      const ret = await this.confirm(data.request, data.confirm);
      data.resolve(ret);
    } catch (e) {
      data.reject(e);
    }
    this.dealConfirmQueue();
  }

  // 确认队列,为了防止一次性打开过多的窗口
  async pushConfirmQueue(request: Request, api: ApiValue): Promise<boolean> {
    const confirm = await api.param.confirm!(request);
    if (confirm === true) {
      return Promise.resolve(true);
    }
    return new Promise((resolve, reject) => {
      this.confirmQueue.push({ request, confirm, resolve, reject });
    });
  }

  async confirm(
    request: Request,
    confirm: boolean | ConfirmParam
  ): Promise<boolean> {
    if (typeof confirm === "boolean") {
      return confirm;
    }
    const cacheKey = CacheKey.permissionConfirm(request.script.id, confirm);
    // 从数据库中查询是否有此权限
    const ret = await Cache.getInstance().getOrSet(cacheKey, async () => {
      let model = await this.permissionDAO.findOne({
        scriptId: request.scriptId,
        permission: confirm.permission,
        permissionValue: confirm.permissionValue || "",
      });
      if (!model) {
        // 允许通配
        if (confirm.wildcard) {
          model = await this.permissionDAO.findOne({
            scriptId: request.scriptId,
            permission: confirm.permission,
            permissionValue: "*",
          });
        }
      }
      return Promise.resolve(model);
    });
    // 有查询到结果,进入判断,不再需要用户确认
    if (ret) {
      if (ret.allow) {
        return Promise.resolve(true);
      }
      // 权限拒绝
      return Promise.reject(new Error("permission denied"));
    }
    // 没有权限,则弹出页面让用户进行确认
    const userConfirm = await this.confirmWindow(request.script, confirm);
    // 成功存入数据库
    const model = {
      id: 0,
      scriptId: request.scriptId,
      permission: confirm.permission,
      permissionValue: "",
      allow: userConfirm.allow,
      createtime: new Date().getTime(),
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
      const oldConfirm = await this.permissionDAO.findOne({
        scriptId: request.scriptId,
        permission: model.permission,
        permissionValue: model.permissionValue,
      });
      if (!oldConfirm) {
        await this.permissionDAO.save(model);
      } else {
        await this.permissionDAO.update(oldConfirm.id, model);
      }
    }
    if (userConfirm.allow) {
      return Promise.resolve(true);
    }
    return Promise.reject(new Error("permission not allowed"));
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
  async confirmWindow(
    script: Script,
    confirm: ConfirmParam
  ): Promise<UserConfirm> {
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
      chrome.tabs.create({
        url: chrome.runtime.getURL(`src/confirm.html?uuid=${uuid}`),
      });
    });
  }
}
