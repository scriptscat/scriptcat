import { ExportScript, ExportSubscribe, ImportResource, ImportScript, ImportScriptOptions, ImportSubscribe, ResourceMeta, Storage } from '@App/model/do/backup';
import { Metadata } from '@App/model/do/script';
import JSZip from 'jszip';
import crypto from 'crypto-js';
import { base64ToBlob, base64ToStr, strToBase64 } from './utils';
import { SubscribeScript } from '@App/model/do/subscribe';
import { ResourceManager } from '@App/apps/resource';

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
	url: string
	enabled: boolean
	scripts: { [key: string]: SubscribeScript };
}

export interface JsonScriptOptions {
	check_for_updates: boolean,
	comment: string | null,
	compat_foreach: boolean,
	compat_metadata: boolean,
	compat_prototypes: boolean,
	compat_wrappedjsobject: boolean,
	compatopts_for_requires: boolean,
	noframes: boolean | null,
	override: {
		merge_connects: boolean,
		merge_excludes: boolean,
		merge_includes: boolean,
		merge_matches: boolean,
		orig_connects: Array<string>,
		orig_excludes: Array<string>,
		orig_includes: Array<string>,
		orig_matches: Array<string>,
		orig_noframes: boolean | null,
		orig_run_at: string,
		use_blockers: Array<string>,
		use_connects: Array<string>,
		use_excludes: Array<string>,
		use_includes: Array<string>,
		use_matches: Array<string>,
	},
	run_at: string | null
}

export interface JsonScript {
	name: string
	options: JsonScriptOptions
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

export interface FileScriptOptions {
	options: JsonScriptOptions,
	settings: { enabled: boolean, position: number },
	meta: {
		name: string,
		// uuid: script.script.uuid,
		modified: number,
		file_url: string,
		subscribe_url?: string
	}
}

export interface FileSubscribeOptions {
	settings: { enabled: boolean },
	scripts: { [key: string]: SubscribeScript },
	meta: {
		name: string,
		modified: number,
		url: string,
	}
}

export interface Backup {
	WriteScript(script: ExportScript): void
	WriteSubscribe(sub: ExportSubscribe): void
	Export(): Promise<void>

	ReadScript(): ImportScript | undefined
	ReadSubscribe(): ImportSubscribe | undefined
	Import(data: Blob): Promise<void>

	Progress(callback: (cur: number, total: number) => void): void
}

export class JsonBackup implements Backup {

	file: JsonFile = {
		created_by: 'ScriptCat',
		version: '1',
		scripts: [],
		subscribes: [],
		// settings: {},
	};

	protected scriptOption(script: ExportScript): JsonScriptOptions {
		return {
			check_for_updates: false,
			comment: null,
			compat_foreach: false,
			compat_metadata: false,
			compat_prototypes: false,
			compat_wrappedjsobject: false,
			compatopts_for_requires: true,
			noframes: null,
			override: {
				merge_connects: true,
				merge_excludes: true,
				merge_includes: true,
				merge_matches: true,
				orig_connects: script.script.metadata['connect'] || [],
				orig_excludes: script.script.metadata['exclude'] || [],
				orig_includes: script.script.metadata['include'] || [],
				orig_matches: script.script.metadata['match'] || [],
				orig_noframes: script.script.metadata['noframe'] ? true : null,
				orig_run_at: (script.script.metadata['run_at'] && script.script.metadata['run_at'][0]) || 'document-idle',
				use_blockers: [],
				use_connects: [],
				use_excludes: [],
				use_includes: [],
				use_matches: [],
			},
			run_at: null,
		};
	}

	WriteScript(script: ExportScript): void {
		// 对资源保存为base64
		const requires = new Array<JsonBackupResource>();
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
		const requires_css = new Array<JsonBackupResource>();
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
		const resources = new Array<JsonBackupResource>();
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
			file_url: script.script.download_url,
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
			url: sub.subscribe.url,
			scripts: sub.subscribe.scripts,
			enabled: sub.enabled,
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
		const script = this.file.scripts[this.scriptCursor++];
		const requires = new Array<ImportResource>();
		script.requires.forEach(val => {
			requires.push({
				meta: val.meta,
				source: base64ToStr(val.source),
				base64: val.source,
			});
		});
		const requires_css = new Array<ImportResource>();
		script.requires_css.forEach(val => {
			requires.push({
				meta: val.meta,
				source: base64ToStr(val.source),
				base64: val.source,
			});
		});
		const resources = new Array<ImportResource>();
		script.resources.forEach(val => {
			if (val.meta.mimetype.startsWith('text/') || ResourceManager.textContentTypeMap.has(val.meta.mimetype)) {
				requires.push({
					meta: val.meta,
					source: base64ToStr(val.source),
					base64: val.source,
				});
			} else {
				requires.push({
					meta: val.meta,
					source: '',
					base64: val.source,
				});
			}
		});

		const options: ImportScriptOptions = {
			name: script.name,
			download_url: script.file_url || '',
			subscribe_url: script.subscribe_url,
		};

		return {
			source: base64ToStr(script.source),
			enabled: script.enabled,
			position: script.position,
			storage: script.storage,
			options: options,
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
			scripts: subscribe.scripts,
			options: {
				name: subscribe.name,
				url: subscribe.url,
			}
		};
	}

	Import(data: Blob): Promise<void> {
		return new Promise(resolve => {
			void data.text().then((text) => {
				this.file = JSON.parse(text);
				resolve();
			});
		});
	}

	progressCallback?: (cur: number, total: number) => void;

	Progress(callback: (cur: number, total: number) => void) {
		this.progressCallback = callback;
	}

	triggerProgress(cur: number, total: number) {
		this.progressCallback && this.progressCallback(cur, total);
	}
}

export class ZipBackup extends JsonBackup implements Backup {

	zip: JSZip = new JSZip();

	WriteScript(script: ExportScript): void {
		this.zip.file(script.name + '.user.js', script.script.code);
		//NOTE: tm会对同名的uuid校验,先屏蔽了
		this.zip.file(script.name + '.options.json', JSON.stringify(<FileScriptOptions>{
			options: this.scriptOption(script),
			settings: { enabled: script.enabled, position: script.position },
			meta: {
				name: script.name,
				// uuid: script.script.uuid,
				modified: script.script.updatetime || script.script.createtime,
				file_url: script.script.download_url,
				subscribe_url: script.script.subscribeUrl,
			}
		}));
		this.zip.file(script.name + '.storage.json', JSON.stringify(script.storage));
		script.requires.forEach(val => {
			// md5是tm的导出规则
			const md5 = crypto.MD5('requires' + val.meta.url).toString();
			this.zip.file(script.name + '.user.js-' + md5 + '-' + val.meta.name, val.source);
			this.zip.file(script.name + '.user.js-' + md5 + '-' + val.meta.name + '.requires.json', JSON.stringify(val.meta));
		});
		script.requires_css.forEach(val => {
			const md5 = crypto.MD5('requires_css' + val.meta.url).toString();
			this.zip.file(script.name + '.user.js-' + md5 + '-' + val.meta.name, val.source);
			this.zip.file(script.name + '.user.js-' + md5 + '-' + val.meta.name + '.requires.css.json', JSON.stringify(val.meta));
		});
		script.resources.forEach(val => {
			const md5 = crypto.MD5('resources' + val.meta.url).toString();
			if (val.meta.mimetype.startsWith('text/') || ResourceManager.textContentTypeMap.has(val.meta.mimetype)) {
				this.zip.file(script.name + '.user.js-' + md5 + '-' + val.meta.name, val.source);
			} else {
				this.zip.file(script.name + '.user.js-' + md5 + '-' + val.meta.name, base64ToBlob(val.base64));
			}
			this.zip.file(script.name + '.user.js-' + md5 + '-' + val.meta.name + '.resources.json', JSON.stringify(val.meta));
		});
	}

	WriteSubscribe(sub: ExportSubscribe): void {
		this.zip.file(sub.name + '.user.sub.js', sub.subscribe.code);
		this.zip.file(sub.name + '.user.sub.options.json', JSON.stringify(<FileSubscribeOptions>{
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

	Import(data: Blob): Promise<void> {
		return new Promise(resolve => {
			void JSZip.loadAsync(data).then(async zip => {
				const scriptMap = new Map<string, ImportScript>();
				const subscribeMap = new Map<string, ImportSubscribe>();
				const resourceMap = new Map<string, ImportResource>();
				// 加载全部文件
				let cur = 0;
				let total = 0;
				zip.forEach(() => {
					total++
				});
				for (const key in zip.files) {
					if (key.endsWith('.user.js')) {
						const name = key.substring(0, key.length - 8);
						await this.getAndSet(scriptMap, name, async (val: ImportScript) => {
							return new Promise(resolve => {
								const handler = async () => {
									const file = zip.files[key];
									if (file) {
										val.source = await file.async('string');
										if (val.enabled === undefined) {
											val.enabled = true;
										}
										if (val.position === undefined) {
											val.position = 0;
										}
									}
									resolve();
								}
								void handler();
							});
						});
					} else if (key.endsWith('.options.json')) {
						if (key.endsWith('.user.sub.options.json')) {
							const name = key.substring(0, key.length - 22);
							await this.getAndSet(subscribeMap, name, async (val: ImportSubscribe) => {
								return new Promise(resolve => {
									const handler = async () => {
										const file = zip.file(key);
										if (file) {
											try {
												const options = <FileSubscribeOptions>JSON.parse(await file.async('string'));
												val.options = {
													name: options.meta.name,
													url: options.meta.url
												};
												val.enabled = options.settings.enabled;
											} catch (e) {
												console.log(e);
											}
										}
										resolve();
									}
									void handler();
								});
							});
						} else {
							const name = key.substring(0, key.length - 13);
							await this.getAndSet(scriptMap, name, async (val: ImportScript) => {
								return new Promise(resolve => {
									const handler = async () => {
										const file = zip.file(key);
										if (file) {
											try {
												const options = <FileScriptOptions>JSON.parse(await file.async('string'));
												val.options = {
													name: options.meta.name,
													download_url: options.meta.file_url,
													subscribe_url: options.meta.subscribe_url,
												};
												val.enabled = options.settings.enabled;
												val.position = options.settings.position;
											} catch (e) {
												console.log(e);
											}
										}
										resolve();
									}
									void handler();
								});
							});
						}
					} else if (key.endsWith('.storage.json')) {
						const name = key.substring(0, key.length - 13);
						await this.getAndSet(scriptMap, name, async (val: ImportScript) => {
							return new Promise(resolve => {
								const handler = async () => {
									const file = zip.file(key);
									if (file) {
										try {
											val.storage = <Storage>JSON.parse(await file.async('string'));
										} catch (e) {
											console.log(e);
										}
									}
									resolve();
								}
								void handler();
							});
						});
					} else if (key.endsWith('.resources.json')) {
						const file = zip.file(key);
						if (file) {
							await this.setResource(scriptMap, resourceMap, 'resource', key, file);
						}
					} else if (key.endsWith('.requires.json')) {
						const file = zip.file(key);
						if (file) {
							await this.setResource(scriptMap, resourceMap, 'require', key, file);
						}
					} else if (key.endsWith('.requires.css.json')) {
						const file = zip.file(key);
						if (file) {
							await this.setResource(scriptMap, resourceMap, 'require.css', key, file);
						}
					} else {
						const pos = key.indexOf('.user.js');
						if (pos === -1) {
							continue
						}
						const name = key.substring(0, pos);
						const md5 = key.substring(pos + 9, pos + 41);
						if (!md5) {
							continue
						}
						let resource = resourceMap.get(name + md5);
						if (!resource) {
							resource = <ImportResource>{ source: '' };
						}
						resourceMap.set(name + md5, resource);
						const file = zip.file(key);
						if (file) {
							try {
								resource.base64 = await file.async('base64');
								if (resource.meta && (resource.meta.mimetype.startsWith('text/') || ResourceManager.textContentTypeMap.has(resource.meta.mimetype))) {
									// 存在meta
									resource.source = base64ToStr(resource.base64)
								}
							} catch (e) {
								console.log(e);
							}
						}
					}
					this.triggerProgress(cur++, total);
				}
				const scripts: ImportScript[] = [];
				const subscribes: ImportSubscribe[] = [];
				scriptMap.forEach(val => {
					scripts.push(val);
				});
				subscribeMap.forEach(val => {
					subscribes.push(val);
				});
				this.scripts = scripts;
				this.subscribes = subscribes;

				resolve();
			});
		});
	}

	scripts: ImportScript[] = [];
	subscribes: ImportSubscribe[] = [];

	scriptCursor = 0;
	subscribeCursor = 0;

	ReadScript(): ImportScript | undefined {
		if (this.scriptCursor >= this.scripts.length) {
			return undefined;
		}
		return this.scripts[this.scriptCursor++];
	}

	ReadSubscribe(): ImportSubscribe | undefined {
		if (this.subscribeCursor >= this.subscribes.length) {
			return undefined;
		}
		return this.subscribes[this.subscribeCursor++];
	}

	setResource(scriptMap: Map<string, ImportScript>, resourceMap: Map<string, ImportResource>, type: string, filename: string, file: JSZip.JSZipObject): Promise<void> {
		return new Promise(resolve => {
			const handler = async () => {
				const pos = filename.indexOf('.user.js');
				if (pos === -1) {
					return resolve();
				}
				const name = filename.substring(0, pos);
				const md5 = filename.substring(pos + 9, pos + 41);
				if (!md5) {
					return resolve();
				}
				let resource = resourceMap.get(name + md5);
				if (!resource) {
					resource = <ImportResource>{ source: '' };
				}
				await this.getAndSet(scriptMap, name, (val: ImportScript) => {
					return new Promise(resolve => {
						if (!resource) {
							return resolve();
						}
						switch (type) {
							case 'resource':
								val.resources = val.resources || [];
								val.resources.push(resource);
								break
							case 'require':
								val.requires = val.requires || [];
								val.requires.push(resource);
								break;
							case 'require.css':
								val.requires_css = val.requires_css || [];
								val.requires_css.push(resource);
								break;
						}
						resolve();
					});
				});
				resourceMap.set(name + md5, resource);
				if (file) {
					try {
						const temp = <ResourceMeta>JSON.parse(await file.async('string'));
						resource.meta = temp;
						if (resource.base64 && (resource.meta.mimetype.startsWith('text/') || ResourceManager.textContentTypeMap.has(resource.meta.mimetype))) {
							// 存在base64
							resource.source = base64ToStr(resource.base64);
						}
					} catch (e) {
						console.log(e);
					}
				}
				resolve();
			}
			void handler();
		});
	}

	getAndSet(map: Map<string, any>, key: string, value: (val: any) => Promise<void>): Promise<void> {
		return new Promise(resolve => {
			const handler = async () => {
				let val = map.get(key);
				if (!val) {
					val = {};
				}
				await value(val);
				map.set(key, val);
				resolve();
			}
			void handler();
		});
	}

}
