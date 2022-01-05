// 使用tampermonkey的备份模式
import { Metadata, Script as InstallScript } from './script';
import { SubscribeScript, Subscribe as InstallSubscribe } from './subscribe';

export interface ExportScript {
	name: string
	script: InstallScript
	storage: Storage
	enabled: boolean
	position: number
	requires: ExportResource[]
	requires_css: ExportResource[]
	resources: ExportResource[]
}

export interface ImportScript {
	source: string
	enabled: boolean
	position: number
	storage?: Storage
	requires?: ImportResource[]
	requires_css?: ImportResource[]
	resources?: ImportResource[]
}

export interface ImportResource {
	meta: { name: string, url: string, ts: number, mimetype: string }
	source: string
	base64: string
}


export interface ExportSubscribe {
	name: string
	subscribe: InstallSubscribe
	enabled: boolean
}

export interface ImportSubscribe {
	source: string
	enabled: boolean
	scripts: { [key: string]: SubscribeScript };
}

export interface ExportResource {
	meta: { name: string, url: string, ts: number, mimetype: string }
	source: string
	base64: string
}

export interface Storage {
	data: { [key: string]: string }
	ts: number
}

