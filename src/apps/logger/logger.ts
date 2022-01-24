import { LOGGER_LEVEL } from '@App/model/do/logger';

export interface Logger {
    // todo 可以改造为可调用实例
    Logger(level: LOGGER_LEVEL, origin: string, msg: string, title: string, scriptId?: number): Logger;

    Debug(origin: string, msg: string, title: string, scriptId?: number): Logger;

    Info(origin: string, msg: string, title: string, scriptId?: number): Logger;

    Warn(origin: string, msg: string, title: string, scriptId?: number): Logger;

    Error(origin: string, msg: string, title: string, scriptId?: number): Logger;

    level?: string;
    title?: string;
    origin?: string;
    message?: string;
    createtime?: Date;
}
