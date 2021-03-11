import { Log, LoggerModel, LOGGER_LEVEL, LOGGER_LEVEL_DEBUG, LOGGER_LEVEL_ERROR, LOGGER_LEVEL_INFO, LOGGER_LEVEL_WARN, LOGGER_TYPE, LOGGER_TYPE_SYSTEM } from "@App/model/logger";

export class Logger {
    public logger = new LoggerModel();

    public Logger(level: LOGGER_LEVEL, origin: string = 'system', ...msg: string[]): Logger {
        let log: Log = {
            id: 0,
            level: level,
            message: msg.join(' '),
            origin: origin,
            createtime: new Date().getTime(),
        };
        this.logger.save(log);
        return this;
    }

    public Debug(origin: string = 'system', ...msg: string[]): Logger {
        return this.Logger(LOGGER_LEVEL_DEBUG, origin, ...msg);
    }

    public Info(origin: string = 'system', ...msg: string[]): Logger {
        return this.Logger(LOGGER_LEVEL_INFO, origin, ...msg);
    }

    public Warn(origin: string = 'system', ...msg: string[]): Logger {
        return this.Logger(LOGGER_LEVEL_WARN, origin, ...msg);
    }

    public Error(origin: string = 'system', ...msg: string[]): Logger {
        return this.Logger(LOGGER_LEVEL_ERROR, origin, ...msg);
    }

}
