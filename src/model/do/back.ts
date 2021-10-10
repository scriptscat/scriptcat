// 使用tampermonkey的备份模式

export interface File {
	created_by: string
	version: string
	scripts: Script[];
}

export interface Script {
	name: string
	options: Options
	storage: Storage
	enabled: boolean
	position: number
	file_url: string
	// base64形式的代码
	source: string
}

export interface Options {

}

export interface Storage {
	data: { [key: string]: string }
	ts:number
}

