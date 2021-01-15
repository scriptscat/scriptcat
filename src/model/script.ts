import { db, Model } from '@App/pkg/model';

export interface Script {
    id: number;
    //script name
    name: string;
    //script code
    code: string;
    //script metadata
    metadata: string;
    //script type.1:normal 2:crontab
    type: number;
    //script install timestamp
    createtime: number;
    //script update timestamp
    updatetime: number;
    //last check update timestamp
    checktime: number;
}

db.version(1).stores({
    script: "++id,&name,code,metadata,type,createtime,updatetime,checktime"
});

export const SCRIPT_TYPE_NORMAL = 1;
export const SCRIPT_TYPE_CRONTAB = 2;

export class ScriptModel extends Model<Script> {

    protected tableName: string = "scripts";
    public findByName(name: string) {
        return this.findOne({ name: name });
    }

}

