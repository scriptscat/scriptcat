import { File, Script, Subscribe } from '@App/model/do/backup';

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
		this.file.scripts.push(script);
	}
	WriteSubscribe(sub: Subscribe): void {
		this.file.subscribes.push(sub);
	}
	Export(): Promise<void> {
		return new Promise(resolve => {
			const nowTime = new Date();
			saveAs(
				new Blob([JSON.stringify(this.file)]),
				'scriptcat-backup ' +
				`${nowTime.getFullYear()}-${nowTime.getMonth()}-${nowTime.getDate()} ${nowTime.getHours()}-${nowTime.getMinutes()}-${nowTime.getSeconds()}` +
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
