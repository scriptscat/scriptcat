import { Log, LOGGER_LEVEL, LOGGER_LEVEL_ERROR, LOGGER_LEVEL_INFO, LOGGER_LEVEL_WARN } from '@App/model/do/logger';
import { LoggerModel } from '@App/model/logger';
import { Logger } from './logger';

export class DBLogger implements Logger {
    public logger = new LoggerModel();

    public Logger(level: LOGGER_LEVEL, origin: string, msg: string, title = '', scriptId?: number): Logger {
        const log: Log = {
            id: 0,
            level: level,
            message: msg,
            origin: origin,
            title: title,
            createtime: new Date().getTime(),
        };
        if (scriptId) {
            log.scriptId = scriptId;
        }
        void this.logger.save(log);
        return this;
    }

    public Debug(origin: string, msg: string, title = '', scriptId?: number): Logger {
        console.log(origin + '-' + title + ': ' + msg, scriptId);
        return this;
        // return this.Logger(LOGGER_LEVEL_DEBUG, origin, msg, title);
    }

    public Info(origin: string, msg: string, title = '', scriptId?: number): Logger {
        return this.Logger(LOGGER_LEVEL_INFO, origin, msg, title, scriptId);
    }

    public Warn(origin: string, msg: string, title = '', scriptId?: number): Logger {
        return this.Logger(LOGGER_LEVEL_WARN, origin, msg, title, scriptId);
    }

    public Error(origin: string, msg: string, title = '', scriptId?: number): Logger {
        return this.Logger(LOGGER_LEVEL_ERROR, origin, msg, title, scriptId);
    }
}
