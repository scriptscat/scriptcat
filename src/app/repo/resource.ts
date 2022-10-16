import LoggerCore from "@App/app/logger/core";
import Logger from "../logger/logger";
import { DAO, db } from "./dao";
import { ResourceLinkDAO } from "./resource_link";

export type ResourceType = "require" | "require-css" | "resource";

export interface Resource {
  id: number;
  url: string;
  content: string;
  base64: string;
  hash: ResourceHash;
  type?: ResourceType;
  contentType: string;
  createtime?: number;
  updatetime?: number;
}

export interface ResourceHash {
  md5: string;
  sha1: string;
  sha256: string;
  sha384: string;
  sha512: string;
}

export class ResourceDAO extends DAO<Resource> {
  public tableName = "resource";

  private logger: Logger;

  private resourceLinkDAO: ResourceLinkDAO;

  constructor() {
    super();
    this.table = db.table(this.tableName);
    this.resourceLinkDAO = new ResourceLinkDAO();
    this.logger = LoggerCore.getInstance().logger({ component: "resource" });
  }
}
