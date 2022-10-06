import { DAO, db } from "./dao";

export interface Permission {
  id: number;
  scriptId: number;
  permission: string;
  permissionValue: string;
  allow: boolean;
  createtime: number;
  updatetime: number;
}

export class PermissionDAO extends DAO<Permission> {
  public tableName = "permission";

  constructor() {
    super();
    this.table = db.table(this.tableName);
  }
}
