// 使用tampermonkey的备份模式

import { ResourceHash } from './resource';
import { Metadata, Script as InstallScript } from './script';
import { SubscribeScript, Subscribe as InstallSubscribe } from './subscribe';

export interface File {
	created_by: string
	version: string
	scripts: Script[];
	subscribes: Subscribe[];
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
	source: string
	requires: Resource[]
	requires_css: Resource[]
	resources: Resource[]
	self_metadata: Metadata
	subscribe_url?: string
	modified: number
	// 导入用,需要解析source获得
	metadata?: Metadata
	script?: InstallScript
	old?: InstallScript
	error?: string
	background?: boolean
}

export interface Subscribe {
	name: string
	url: string
	enabled: boolean
	source: string
	scripts: { [key: string]: SubscribeScript };
	modified: number
	// 导入用,解析source获得
	metadata?: Metadata
	subscribe?: InstallSubscribe
	old?: InstallSubscribe
	error?: string
}

export interface Options {

}

export interface Resource {
	meta: { name: string, url: string, ts: number, mimetype: string }
	source: string
	base64?: string
	hash: ResourceHash
}

export interface Storage {
	data: { [key: string]: string }
	ts: number
}

