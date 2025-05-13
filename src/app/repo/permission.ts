import { Repo } from "./repo";

export interface Permission {
  uuid: string;
  permission: string;
  permissionValue: string;
  allow: boolean;
  createtime: number;
  updatetime: number;
}

export class PermissionDAO extends Repo<Permission> {
  constructor() {
    super("permission");
  }

  key(model: Permission) {
    return model.uuid + ":" + model.permission + ":" + model.permissionValue;
  }

  findByKey(uuid: string, permission: string, permissionValue: string) {
    return this.get(uuid + ":" + permission + ":" + permissionValue);
  }

  save(value: Permission) {
    return super._save(this.key(value), value);
  }
}
