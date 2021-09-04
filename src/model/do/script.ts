import { ScriptContext } from "@App/apps/grant/frontend";
import { Resource } from "./resource";
import { Value } from "./value";

export type SCRIPT_TYPE = 1 | 2 | 3;

export const SCRIPT_TYPE_NORMAL: SCRIPT_TYPE = 1;
export const SCRIPT_TYPE_CRONTAB: SCRIPT_TYPE = 2;
export const SCRIPT_TYPE_BACKGROUND: SCRIPT_TYPE = 3;


export type SCRIPT_STATUS = 1 | 2 | 3 | 4;

export const SCRIPT_STATUS_ENABLE: SCRIPT_STATUS = 1;
export const SCRIPT_STATUS_DISABLE: SCRIPT_STATUS = 2;
export const SCRIPT_STATUS_ERROR: SCRIPT_STATUS = 3;
export const SCRIPT_STATUS_PREPARE: SCRIPT_STATUS = 4;

export type SCRIPT_RUN_STATUS = 'running' | 'complete' | 'error' | 'retry';
export const SCRIPT_RUN_STATUS_RUNNING: SCRIPT_RUN_STATUS = 'running';
export const SCRIPT_RUN_STATUS_COMPLETE: SCRIPT_RUN_STATUS = 'complete';
export const SCRIPT_RUN_STATUS_ERROR: SCRIPT_RUN_STATUS = 'error';
export const SCRIPT_RUN_STATUS_RETRY: SCRIPT_RUN_STATUS = 'retry';


export const SCRIPT_ORIGIN_LOCAL = 'local';

export type Metadata = { [key: string]: string[] };

export type ConfigType = 'text' | 'boolean' | 'select' | 'number';

export interface Config {
    [key: string]: any
    title: string
    description: string
    default?: any
    type?: ConfigType
}

export type UserConfig = { [key: string]: { [key: string]: Config } };

export interface ScriptCache extends Script {
    grantMap?: { [key: string]: string }
    value?: { [key: string]: Value }
    flag?: string
    resource?: { [key: string]: Resource }
    context?: ScriptContext
}

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
    download_url: string
    //script metadata
    metadata: Metadata;
    // user config
    config?: UserConfig;
    //script type. 1:normal 2:crontab
    type: SCRIPT_TYPE;
    //script status. 1:enable 2:disable 3:error 4:prepare
    status: SCRIPT_STATUS;
    // 脚本排序
    sort: number;
    //script run status.
    runStatus: SCRIPT_RUN_STATUS;
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
