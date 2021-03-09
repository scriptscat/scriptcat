import { db, Model } from '@App/model/model';

export type SCRIPT_TYPE = 1 | 2;

export const SCRIPT_TYPE_NORMAL: SCRIPT_TYPE = 1;
export const SCRIPT_TYPE_CRONTAB: SCRIPT_TYPE = 2;


export type SCRIPT_STATUS = 1 | 2 | 3 | 4;

export const SCRIPT_STATUS_ENABLE: SCRIPT_STATUS = 1;
export const SCRIPT_STATUS_DISABLE: SCRIPT_STATUS = 2;
export const SCRIPT_STATUS_ERROR: SCRIPT_STATUS = 3;
export const SCRIPT_STATUS_PREPARE: SCRIPT_STATUS = 4;

export const SCRIPT_ORIGIN_LOCAL = 'local';

export type Metadata = { [key: string]: string[] };

export interface Script {
    id: number;
    uuid: string;
    //script name
    name: string;
    //script code
    code: string;
    namespace: string
    author: string
    origin_domain: string
    //script origin
    origin: string
    //script checkupdate meta url
    checkupdate_url: string
    //script metadata
    metadata: Metadata;
    //script type. 1:normal 2:crontab
    type: SCRIPT_TYPE;
    //script status. 1:enable 2:disable 3:error 4:prepare
    status: SCRIPT_STATUS;
    //script error info
    error?: string;
    //script install timestamp
    createtime?: number;
    //script update timestamp
    updatetime?: number;
    //last check update timestamp
    checktime: number;
    lastruntime?: number;
    delayruntime?: number;
}

export class ScriptModel extends Model<Script> {

    public tableName: string = "scripts";

    constructor() {
        super();
        this.table = db.table(this.tableName);
    }

    public findByName(name: string) {
        return this.findOne({ name: name });
    }

    public findByUUID(uuid: string) {
        return this.findOne({ uuid: uuid });
    }
}

