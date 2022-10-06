import { DAO, db } from "./dao";

export interface ResourceLink {
  id: number;
  url: string;
  scriptId: number;
  createtime?: number;
}

export class ResourceLinkDAO extends DAO<ResourceLink> {
  public tableName = "resourceLink";

  constructor() {
    super();
    this.table = db.table(this.tableName);
  }
}
