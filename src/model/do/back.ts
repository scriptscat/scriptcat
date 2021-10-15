// 使用tampermonkey的备份模式

import { Metadata, Script as InstallScript, SCRIPT_TYPE } from "./script";

export interface File {
	created_by: string
	version: string
	scripts: Script[];
	settings: Settings
}

export interface Settings {

}

export interface Script {
	name: string
	options: Options
	storage: Storage
	enabled: boolean
	position: number
	uuid: string
	file_url?: string
	// base64形式的代码
	source: string
	requires: Resource[]
	requires_css: Resource[]
	resources: Resource[]
	// 需要解析resource获得
	metadata?: Metadata
	script?: InstallScript
	old?: InstallScript
	error?: string
	background?: boolean
}

export interface Options {

}

export interface Resource {
	meta: { name: string, url: string, ts: number, mimetype: string }
	// base64形式的代码
	source: string
}

export interface Storage {
	data: { [key: string]: string }
	ts: number
}

