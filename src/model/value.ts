import { db, Model } from '@App/model/model';

export interface Value {
    id: number
    scriptId: number
    namespace?: string
    key: string
    value: any
    createtime: number
}

export class ValueModel extends Model<Value> {

    public tableName: string = "value";

    constructor() {
        super();
        this.table = db.table(this.tableName);
    }

}

