import { LOGGER_LEVEL } from '@App/model/do/logger';

const LogLevelMap: { [key: string]: number } = {
	error: 100,
	warn: 1000,
	info: 10000,
	debug: 100000,
};

export interface Logger {
	// todo 可以改造为可调用实例
	Logger(
		level: LOGGER_LEVEL,
		origin: string,
		msg: string,
		title: string,
		scriptId?: number
	): Logger;

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

export function createLogger(param: {
	catalog: LogCatalog;
	level: LOGGER_LEVEL;
	transports: LoggerTransports[];
}): LoggerV2 {
	return new LoggerV2(param.catalog, param.level, param.transports);
}

export type LogCatalog = { [key: string]: string };

export interface LoggerTransports {
	log(level: LOGGER_LEVEL, catalog: LogCatalog, info: any): any;
}

// 重构日志组件,先内部系统使用
class LoggerV2 {
	level: LOGGER_LEVEL;
	logLevel: number;
	protected catalog: LogCatalog;
	protected transports: LoggerTransports[];

	constructor(catalog: LogCatalog, level: LOGGER_LEVEL, transports: LoggerTransports[]) {
		this.catalog = catalog;
		this.level = level;
		this.logLevel = LogLevelMap[level];
		this.transports = transports;
	}

	protected log(level: LOGGER_LEVEL, info: any): LoggerV2 {
		if (LogLevelMap[level] < this.logLevel) {
			return this;
		}
		this.transports.forEach((transport) => {
			transport.log(level, this.catalog, info);
		});
		return this;
	}

	public createLogger(catalog: LogCatalog) {
		for (const key in this.catalog) {
			if (!catalog[key]) {
				catalog[key] = this.catalog[key];
			}
		}
		return new LoggerV2(catalog, this.level, this.transports);
	}

	public debug(info: any): LoggerV2 {
		return this.log('debug', info);
	}

	public info(info: any): LoggerV2 {
		return this.log('info', info);
	}

	public warn(info: any): LoggerV2 {
		return this.log('warn', info);
	}

	public error(info: any): LoggerV2 {
		return this.log('error', info);
	}
}
