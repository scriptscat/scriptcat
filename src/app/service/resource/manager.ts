/* eslint-disable no-await-in-loop */
import ConnectCenter from "@App/app/connect/center";
import LoggerCore from "@App/app/logger/core";
import Logger from "@App/app/logger/logger";
import { Resource, ResourceDAO } from "@App/app/repo/resource";
import { ResourceLinkDAO } from "@App/app/repo/resource_link";
import { Script } from "@App/app/repo/scripts";
import Manager from "../manager";

// 资源管理器,负责资源的更新获取等操作
export class ResourceManager extends Manager {
  static instance: ResourceManager;

  static getInstance() {
    return ResourceManager.instance;
  }

  resourceDAO: ResourceDAO;

  resourceLinkDAO: ResourceLinkDAO;

  logger: Logger;

  constructor(center: ConnectCenter) {
    super(center);
    if (!ResourceManager.instance) {
      ResourceManager.instance = this;
    }
    this.resourceDAO = new ResourceDAO();
    this.resourceLinkDAO = new ResourceLinkDAO();
    this.logger = LoggerCore.getInstance().logger({
      component: "resource",
    });
  }

  public async getResource(
    id: number,
    url: string
  ): Promise<Resource | undefined> {
    let res = await this.resourceDAO.getResource(url);
    if (res) {
      return Promise.resolve(res);
    }
    try {
      res = await this.resourceDAO.addResource(url, id);
      if (res) {
        return Promise.resolve(res);
      }
    } catch (e) {
      this.logger.debug("get resource failed", { id, url }, Logger.E(e));
    }
    return Promise.resolve(undefined);
  }

  public async getScriptResources(
    script: Script
  ): Promise<{ [key: string]: Resource }> {
    const ret: { [key: string]: Resource } = {};
    for (let i = 0; i < script.metadata.require?.length; i += 1) {
      const res = await this.getResource(script.id, script.metadata.require[i]);
      if (res) {
        res.type = "require";
        ret[script.metadata.require[i]] = res;
      }
    }
    for (let i = 0; i < script.metadata["require-css"]?.length; i += 1) {
      const res = await this.getResource(
        script.id,
        script.metadata["require-css"][i]
      );
      if (res) {
        res.type = "require-css";
        ret[script.metadata["require-css"][i]] = res;
      }
    }

    for (let i = 0; i < script.metadata.resource?.length; i += 1) {
      const split = script.metadata.resource[i].split(/\s+/);
      if (split.length === 2) {
        const res = await this.getResource(script.id, split[1]);
        if (res) {
          res.type = "resource";
          ret[split[0]] = res;
        }
      }
    }
    return Promise.resolve(ret);
  }
}

export default ResourceManager;
