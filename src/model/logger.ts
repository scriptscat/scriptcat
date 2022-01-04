import { db, Model } from '@App/model/model';
import { Log } from './do/logger';

export class LoggerModel extends Model<Log> {

    public tableName = 'logger';

    constructor() {
        super();
        this.table = db.table(this.tableName);
    }

}

