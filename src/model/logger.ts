import { db, Model } from '@App/model/model';

export type LOGGER_TYPE = 1 | 2;

export const LOGGER_TYPE_SYSTEM: LOGGER_TYPE = 1;
export const LOGGER_TYPE_SCRIPT: LOGGER_TYPE = 2;

export type LOGGER_LEVEL = 1 | 2 | 3 | 4;

export const LOGGER_LEVEL_DEBUG: LOGGER_LEVEL = 1;
export const LOGGER_LEVEL_INFO: LOGGER_LEVEL = 2;
export const LOGGER_LEVEL_WARN: LOGGER_LEVEL = 3;
export const LOGGER_LEVEL_ERROR: LOGGER_LEVEL = 4;

export interface Log {
    id: number
    level: LOGGER_LEVEL
    code: number
    message: string
    origin: string
    type: LOGGER_TYPE
    createtime: number
}

export class LoggerModel extends Model<Log> {

    public tableName: string = "logger";

    constructor() {
        super();
        this.table = db.table(this.tableName);
    }

}

