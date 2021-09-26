import { db, Model } from '@App/model/model';
import { Script } from './do/script';

export class ScriptModel extends Model<Script> {

    public tableName: string = "scripts";

    constructor() {
        super();
        this.table = db.table(this.tableName);
    }

    public findByName(name: string) {
        return this.findOne({ name: name });
    }

    public findByNameAndNamespace(name: string, namespace?: string) {
        if (namespace) {
            return this.findOne({ name: name, namespace: namespace });
        }
        return this.findOne({ name: name });
    }

    public findByUUID(uuid: string) {
        return this.findOne({ uuid: uuid });
    }

    public findByUUIDAndSubscribeId(uuid: string, subId: number) {
        return this.findOne({ subscribeId: subId, uuid: uuid });
    }

    public findByOriginAndSubscribeId(origin: string, subId: number) {
        return this.findOne({ subscribeId: subId, origin: origin });
    }
}

