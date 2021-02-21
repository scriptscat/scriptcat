import { Log, LoggerModel, LOGGER_LEVEL, LOGGER_LEVEL_DEBUG, LOGGER_LEVEL_ERROR, LOGGER_LEVEL_INFO, LOGGER_LEVEL_WARN, LOGGER_TYPE, LOGGER_TYPE_SYSTEM } from "@App/model/logger";

export class Logger {
    public logger = new LoggerModel();

    public Logger(level: LOGGER_LEVEL, code: number, msg: string, origin: string = 'system', type: LOGGER_TYPE = LOGGER_TYPE_SYSTEM): Logger {
        let log: Log = {
            id: 0,
            level: level,
            code: code,
            message: msg,
            origin: origin,
            type: type,
            createtime: new Date().getTime(),
        };
        this.logger.save(log);
        return this;
    }

    public Debug(code: number, msg: string, origin: string = 'system', type: LOGGER_TYPE = LOGGER_TYPE_SYSTEM): Logger {
        return this.Logger(LOGGER_LEVEL_DEBUG, code, msg, origin, type);
    }

    public Info(code: number, msg: string, origin: string = 'system', type: LOGGER_TYPE = LOGGER_TYPE_SYSTEM): Logger {
        return this.Logger(LOGGER_LEVEL_INFO, code, msg, origin, type);
    }

    public Warn(code: number, msg: string, origin: string = 'system', type: LOGGER_TYPE = LOGGER_TYPE_SYSTEM): Logger {
        return this.Logger(LOGGER_LEVEL_WARN, code, msg, origin, type);;
    }

    public Error(code: number, msg: string, origin: string = 'system', type: LOGGER_TYPE = LOGGER_TYPE_SYSTEM): Logger {
        return this.Logger(LOGGER_LEVEL_ERROR, code, msg, origin, type);;
    }

}

