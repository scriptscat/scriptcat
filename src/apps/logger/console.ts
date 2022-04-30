import {
	LOGGER_LEVEL,
	LOGGER_LEVEL_DEBUG,
	LOGGER_LEVEL_ERROR,
	LOGGER_LEVEL_INFO,
	LOGGER_LEVEL_WARN,
} from '@App/model/do/logger';
import { LogCatalog, Logger, LoggerTransports } from './logger';

export class ConsoleLogger implements Logger {
	public Logger(level: LOGGER_LEVEL, origin: string, msg: string, title = ''): Logger {
		console.log({ level: level, origin: origin, msg: msg, title: title });
		return this;
	}

	public Debug(origin: string, msg: string, title = ''): Logger {
		return this.Logger(LOGGER_LEVEL_DEBUG, origin, msg, title);
	}

	public Info(origin: string, msg: string, title = ''): Logger {
		return this.Logger(LOGGER_LEVEL_INFO, origin, msg, title);
	}

	public Warn(origin: string, msg: string, title = ''): Logger {
		return this.Logger(LOGGER_LEVEL_WARN, origin, msg, title);
	}

	public Error(origin: string, msg: string, title = ''): Logger {
		return this.Logger(LOGGER_LEVEL_ERROR, origin, msg, title);
	}
}

export class ConsoleTransports implements LoggerTransports {
	log(level: LOGGER_LEVEL, catalog: LogCatalog, info: any) {
		let catalogStr = '';
		if (catalog) {
			catalogStr = ' [';
			for (const key in catalog) {
				catalogStr += `${key}:${catalog[key]},`;
			}
            catalogStr=catalogStr.substring(0, catalogStr.length - 1);
			catalogStr += ']';
		}
		console.log('[%s]%s - %s', level, catalogStr, info);
	}
}
