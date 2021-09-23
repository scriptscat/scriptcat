import { Sync } from "./do/sync";
import { db, Model } from "./model";


export class SyncModel extends Model<Sync> {

    public tableName = 'sync';

    constructor() {
        super();
        this.table = db.table(this.tableName);
    }

    public findByKey(key: string) {
        return this.findOne({ key: key });
    }

}

