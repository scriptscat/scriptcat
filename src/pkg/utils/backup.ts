import { ExportScript, ExportSubscribe, ImportResource, ImportScript, ImportSubscribe, Storage } from '@App/model/do/backup';
import { Metadata } from '@App/model/do/script';
import JSZip from 'jszip';
import crypto from 'crypto-js';
import { base64ToStr, blobToBase64, strToBase64 } from './utils';
import { SubscribeScript } from '@App/model/do/subscribe';

export interface JsonFile {
	created_by: string
	version: string
	scripts: JsonScript[];
	subscribes: JsonSubscribe[];
	// settings: Settings
}

export interface JsonSubscribe {
	name: string
	source: string
	enabled: boolean
	scripts: { [key: string]: SubscribeScript };
}

export interface ScriptOptions {
	check_for_updates: boolean,
	comment: string,
	compat_foreach: boolean,
	compat_metadata: boolean,
	compat_prototypes: boolean,
	compat_wrappedjsobject: boolean,
	compatopts_for_requires: boolean,
	noframes: boolean,
	override: {
		merge_connects: boolean,
		merge_excludes: boolean,
		merge_includes: boolean,
		merge_matches: boolean,
		orig_connects: Array<string>,
		orig_excludes: Array<string>,
		orig_includes: Array<string>,
		orig_matches: Array<string>,
		orig_noframe: boolean,
		orig_run_at: string,
		use_blockers: Array<string>,
		use_connects: Array<string>,
		use_excludes: Array<string>,
		use_includes: Array<string>,
		use_matches: Array<string>,
	},
	run_at: string
}

export interface JsonScript {
	name: string
	options: ScriptOptions
	storage: Storage
	enabled: boolean
	position: number
	uuid: string
	file_url?: string
	source: string
	requires: JsonBackupResource[]
	requires_css: JsonBackupResource[]
	resources: JsonBackupResource[]
	self_metadata: Metadata
	subscribe_url?: string
}

export interface JsonBackupResource {
	meta: { name: string, url: string, ts: number, mimetype: string }
	source: string
}


export interface Backup {
	WriteScript(script: ExportScript): void
	WriteSubscribe(sub: ExportSubscribe): void
	Export(): Promise<void>

	ReadScript(): ImportScript | undefined
	ReadSubscribe(): ImportSubscribe | undefined
	Import(data: any): Promise<void>
}

export class JsonBackup implements Backup {

	file: JsonFile = {
		created_by: 'ScriptCat',
		version: '1',
		scripts: [],
		subscribes: [],
		// settings: {},
	};

	protected scriptOption(script: ExportScript): ScriptOptions {
		return {
			check_for_updates: false,
			comment: '',
			compat_foreach: false,
			compat_metadata: false,
			compat_prototypes: false,
			compat_wrappedjsobject: false,
			compatopts_for_requires: false,
			noframes: false,
			override: {
				merge_connects: false,
				merge_excludes: false,
				merge_includes: false,
				merge_matches: false,
				orig_connects: [],
				orig_excludes: [],
				orig_includes: [],
				orig_matches: [],
				orig_noframe: false,
				orig_run_at: '',
				use_blockers: [],
				use_connects: [],
				use_excludes: [],
				use_includes: [],
				use_matches: [],
			},
			run_at: '',
		};
	}

	WriteScript(script: ExportScript): void {
		// 对资源保存为base64
		let requires = new Array<JsonBackupResource>();
		script.requires.forEach(val => {
			if (val.base64) {
				requires.push({
					meta: val.meta,
					source: val.base64.substring(
						val.base64.indexOf('base64,') + 7
					)
				});
			}
		});
		let requires_css = new Array<JsonBackupResource>();
		script.requires_css.forEach(val => {
			if (val.base64) {
				requires_css.push({
					meta: val.meta,
					source: val.base64.substring(
						val.base64.indexOf('base64,') + 7
					)
				});
			}
		});
		let resources = new Array<JsonBackupResource>();
		script.resources.forEach(val => {
			if (val.base64) {
				resources.push({
					meta: val.meta,
					source: val.base64.substring(
						val.base64.indexOf('base64,') + 7
					)
				});
			}
		});
		this.file.scripts.push({
			name: script.name,
			options: this.scriptOption(script),
			storage: script.storage,
			enabled: script.enabled,
			position: script.position,
			uuid: script.script.uuid,
			file_url?: script.script.download_url,
			source: strToBase64(script.script.code),
			requires: requires,
			requires_css: requires_css,
			resources: resources,
			self_metadata: script.script.selfMetadata,
			subscribe_url: script.script.subscribeUrl,
		});
	}

	WriteSubscribe(sub: ExportSubscribe): void {
		this.file.subscribes.push({
			name: sub.name,
			source: strToBase64(sub.subscribe.code),
			scripts: sub.subscribe.scripts,
			enabled: sub.enabled
		});
	}
	Export(): Promise<void> {
		return new Promise(resolve => {
			const nowTime = new Date();
			saveAs(
				new Blob([JSON.stringify(this.file)]),
				'scriptcat-backup ' +
				`${nowTime.getFullYear()}-${nowTime.getMonth() + 1}-${nowTime.getDate()} ${nowTime.getHours()}-${nowTime.getMinutes()}-${nowTime.getSeconds()}` +
				'.json'
			);
			resolve();
		});
	}

	scriptCursor = 0;
	subscribeCursor = 0;

	ReadScript(): ImportScript | undefined {
		if (this.scriptCursor >= this.file.scripts.length) {
			return undefined;
		}
		const script = this.file.scripts[this.scriptCursor];
		let requires = new Array<ImportResource>();
		script.requires.forEach(val => {
			requires.push({
				meta: val.meta,
				source: base64ToStr(val.source),
				base64: val.source,
			});
		});
		let requires_css = new Array<ImportResource>();
		script.requires_css.forEach(val => {
			requires.push({
				meta: val.meta,
				source: base64ToStr(val.source),
				base64: val.source,
			});
		});
		let resources = new Array<ImportResource>();
		script.resources.forEach(val => {
			requires.push({
				meta: val.meta,
				source: base64ToStr(val.source),
				base64: val.source,
			});
		});
		return {
			source: base64ToStr(script.source),
			enabled: script.enabled,
			position: script.position,
			storage: script.storage,
			requires: requires,
			requires_css: requires_css,
			resources: resources,
		};
	}

	ReadSubscribe(): ImportSubscribe | undefined {
		if (this.subscribeCursor >= this.file.subscribes.length) {
			return undefined;
		}
		const subscribe = this.file.subscribes[this.subscribeCursor++];
		return {
			source: base64ToStr(subscribe.source),
			enabled: subscribe.enabled,
			scripts: subscribe.scripts
		};
	}

	Import(data: Blob): Promise<void> {
		return new Promise(resolve => {
			data.text().then((text) => {
				this.file = JSON.parse(text);
				resolve();
			});
		});
	}

}

export class ZipBackup extends JsonBackup implements Backup {

	zip: JSZip = new JSZip();

	WriteScript(script: ExportScript): void {
		this.zip.file(script.name + '.user.js', script.script.code);
		this.zip.file(script.name + '.options.json', JSON.stringify({
			options: this.scriptOption(script),
			settings: { enabled: script.enabled, position: script.position },
			meta: {
				name: script.name,
				uuid: script.script.uuid,
				modified: script.script.updatetime || script.script.createtime,
				file_url: script.script.download_url,
			}
		}));
		this.zip.file(script.name + '.storage.json', JSON.stringify(script.storage));
		script.requires.forEach(val => {
			if (val.base64) {
				const md5 = crypto.MD5('requires' + val.meta.url).toString();
				this.zip.file(script.name + '.user.js-' + md5 + '-' + val.meta.name, val.source);
				this.zip.file(script.name + '.user.js-' + md5 + '-' + val.meta.name + '.require.json', JSON.stringify(val.meta));
			}
		});
		script.requires_css.forEach(val => {
			if (val.base64) {
				const md5 = crypto.MD5('requires_css' + val.meta.url).toString();
				this.zip.file(script.name + '.user.js-' + md5 + '-' + val.meta.name, val.source);
				this.zip.file(script.name + '.user.js-' + md5 + '-' + val.meta.name + '.require.css.json', JSON.stringify(val.meta));
			}
		});
		script.resources.forEach(val => {
			if (val.base64) {
				const md5 = crypto.MD5('resources' + val.meta.url).toString();
				this.zip.file(script.name + '.user.js-' + md5 + '-' + val.meta.name, val.source);
				this.zip.file(script.name + '.user.js-' + md5 + '-' + val.meta.name + '.resource.json', JSON.stringify(val.meta));
			}
		});
	}

	WriteSubscribe(sub: ExportSubscribe): void {
		this.zip.file(sub.name + '.user.sub.js', sub.subscribe.code);
		this.zip.file(sub.name + '.user.sub.options.json', JSON.stringify({
			settings: { enabled: sub.enabled },
			scripts: sub.subscribe.scripts,
			meta: {
				name: sub.name,
				modified: sub.subscribe.updatetime || sub.subscribe.createtime,
				url: sub.subscribe.url,
			}
		}));
	}

	Export(): Promise<void> {
		return new Promise(resolve => {
			const nowTime = new Date();
			void this.zip.generateAsync({
				type: 'blob',
				compression: 'DEFLATE',
				compressionOptions: {
					level: 9
				},
				comment: 'Created by Scriptcat'
			}).then((content) => {
				saveAs(content,
					'scriptcat-backup ' +
					`${nowTime.getFullYear()}-${nowTime.getMonth() + 1}-${nowTime.getDate()} ${nowTime.getHours()}-${nowTime.getMinutes()}-${nowTime.getSeconds()}` +
					'.zip');
				resolve();
			});
		});
	}

	Import(data: File): Promise<void> {
		return new Promise(resolve => {
			void JSZip.loadAsync(data).then(zip => {
				for (const key in zip.files) {
					console.log(key);
				}
				resolve();
			});
		});
	}

}
