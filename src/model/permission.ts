import { db, Model } from '@App/model/model';

export interface Permission {
    id: number
    scriptId: number
    permission: string
    permissionValue: string
    allow: boolean
    createtime: number
    updatetime: number
}

export class PermissionModel extends Model<Permission> {

    public tableName: string = "permission";

    constructor() {
        super();
        this.table = db.table(this.tableName);
    }

}

