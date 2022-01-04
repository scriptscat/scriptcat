import { File, Script, Subscribe } from '@App/model/do/backup';
import JSZip from 'jszip';
import crypto from 'crypto-js';
import { base64ToBlob, strToBase64 } from './utils';

export interface Backup {
	WriteScript(script: Script): void
	WriteSubscribe(sub: Subscribe): void
	Export(): Promise<void>

	ReadScript(): Script | undefined
	ReadSubscribe(): Subscribe | undefined
	Import(data: any): Promise<void>
}

export class JsonBackup implements Backup {

	file: File = {
		created_by: 'ScriptCat',
		version: '1',
		scripts: [],
		subscribes: [],
		settings: {},
	};

	WriteScript(script: Script): void {
		script.source = strToBase64(script.source);
		// 对资源保存为base64
		script.requires.forEach(val => {
			if (val.base64) {
				val.source = val.base64.substring(
					val.base64.indexOf('base64,') + 7
				);
				delete val.base64
			}
		});
		script.requires_css.forEach(val => {
			if (val.base64) {
				val.source = val.base64.substring(
					val.base64.indexOf('base64,') + 7
				);
				delete val.base64
			}
		});
		script.resources.forEach(val => {
			if (val.base64) {
				val.source = val.base64.substring(
					val.base64.indexOf('base64,') + 7
				);
				delete val.base64
			}
		});
		this.file.scripts.push(script);
	}

	WriteSubscribe(sub: Subscribe): void {
		sub.source = strToBase64(sub.source);
		this.file.subscribes.push(sub);
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

	ReadScript(): Script | undefined {
		if (this.scriptCursor >= this.file.scripts.length) {
			return undefined;
		}
		return this.file.scripts[this.scriptCursor++];
	}

	ReadSubscribe(): Subscribe | undefined {
		if (this.subscribeCursor >= this.file.subscribes.length) {
			return undefined;
		}
		return this.file.subscribes[this.subscribeCursor++];
	}

	Import(data: any): Promise<void> {
		return new Promise(resolve => {
			this.file = <File>data;
			resolve();
		});
	}

}

export class ZipBackup implements Backup {

	zip: JSZip = new JSZip();

	WriteScript(script: Script): void {
		this.zip.file(script.name + '.user.js', script.source);
		this.zip.file(script.name + '.options.json', JSON.stringify({
			options: script.options,
			settings: { enabled: script.enabled, position: script.position },
			meta: {
				name: script.name,
				uuid: script.uuid,
				modified: script.modified,
				file_url: script.file_url,
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

	WriteSubscribe(sub: Subscribe): void {
		this.zip.file(sub.name + '.user.sub.js', sub.source);
		this.zip.file(sub.name + '.user.sub.options.json', JSON.stringify({
			settings: { enabled: sub.enabled },
			scripts: sub.scripts,
			meta: {
				name: sub.name,
				modified: sub.modified,
				url: sub.url,
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

	ReadScript(): Script | undefined {
		throw new Error('Method not implemented.');
	}

	ReadSubscribe(): Subscribe | undefined {
		throw new Error('Method not implemented.');
	}

	Import(data: any): Promise<void> {
		throw new Error('Method not implemented.');
	}

}