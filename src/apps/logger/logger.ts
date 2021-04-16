import { LOGGER_LEVEL, Log, LOGGER_LEVEL_INFO, LOGGER_LEVEL_WARN, LOGGER_LEVEL_ERROR, LOGGER_LEVEL_DEBUG } from "@App/model/do/logger";
import { LoggerModel } from "@App/model/logger";

export interface Logger {
    // todo 可以改造为可调用实例
    Logger(level: LOGGER_LEVEL, origin: string, msg: string, title: string): Logger;

    Debug(origin: string, msg: string, title: string): Logger;

    Info(origin: string, msg: string, title: string): Logger;

    Warn(origin: string, msg: string, title: string): Logger;

    Error(origin: string, msg: string, title: string): Logger;

    level?: string;
    title?: string;
    origin?: string;
    message?: string;
    createtime?: Date;
}
export class DBLogger implements Logger {
    public logger = new LoggerModel();

    public Logger(level: LOGGER_LEVEL, origin: string, msg: string, title: string = ""): Logger {
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

    public Debug(origin: string, msg: string, title: string = ""): Logger {
        console.log(origin + "-" + title + ": " + msg);
        return this;
        // return this.Logger(LOGGER_LEVEL_DEBUG, origin, msg, title);
    }

    public Info(origin: string, msg: string, title: string = ""): Logger {
        return this.Logger(LOGGER_LEVEL_INFO, origin, msg, title);
    }

    public Warn(origin: string, msg: string, title: string = ""): Logger {
        return this.Logger(LOGGER_LEVEL_WARN, origin, msg, title);
    }

    public Error(origin: string, msg: string, title: string = ""): Logger {
        return this.Logger(LOGGER_LEVEL_ERROR, origin, msg, title);
    }
}

export class ConsoleLogger implements Logger {
    public Logger(level: LOGGER_LEVEL, origin: string, msg: string, title: string = ""): Logger {
        console.log({ level: level, origin: origin, msg: msg, title: title });
        return this;
    }

    public Debug(origin: string, msg: string, title: string = ""): Logger {
        return this.Logger(LOGGER_LEVEL_DEBUG, origin, msg, title);
    }

    public Info(origin: string, msg: string, title: string = ""): Logger {
        return this.Logger(LOGGER_LEVEL_INFO, origin, msg, title);
    }

    public Warn(origin: string, msg: string, title: string = ""): Logger {
        return this.Logger(LOGGER_LEVEL_WARN, origin, msg, title);
    }

    public Error(origin: string, msg: string, title: string = ""): Logger {
        return this.Logger(LOGGER_LEVEL_ERROR, origin, msg, title);
    }
}
