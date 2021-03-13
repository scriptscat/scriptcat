import { Log, LoggerModel, LOGGER_LEVEL, LOGGER_LEVEL_DEBUG, LOGGER_LEVEL_ERROR, LOGGER_LEVEL_INFO, LOGGER_LEVEL_WARN, LOGGER_TYPE, LOGGER_TYPE_SYSTEM } from "@App/model/logger";

export class Logger {
    public logger = new LoggerModel();

    public Logger(level: LOGGER_LEVEL, origin: string, msg: string, title: string = ''): Logger {
        let log: Log = {
            id: 0,
            level: level,
            message: msg,
            origin: origin,
            title: title,
            createtime: new Date().getTime(),
        };
        this.logger.save(log);
        return this;
    }

    public Debug(origin: string, msg: string, title: string = ''): Logger {
        return this.Logger(LOGGER_LEVEL_DEBUG, origin, msg, title);
    }

    public Info(origin: string, msg: string, title: string = ''): Logger {
        return this.Logger(LOGGER_LEVEL_INFO, origin, msg, title);
    }

    public Warn(origin: string, msg: string, title: string = ''): Logger {
        return this.Logger(LOGGER_LEVEL_WARN, origin, msg, title);
    }

    public Error(origin: string, msg: string, title: string = ''): Logger {
        return this.Logger(LOGGER_LEVEL_ERROR, origin, msg, title);
    }

}
