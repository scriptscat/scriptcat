import { Subscribe } from "./do/subscribe";
import { db, Model } from "./model";


export class SubscribeModel extends Model<Subscribe> {

    public tableName = 'subscribe';

    constructor() {
        super();
        this.table = db.table(this.tableName);
    }

    public findByUrl(url: string) {
        return this.findOne({ url: url });
    }

}

