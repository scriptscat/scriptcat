import { Manager } from "@App/pkg/apps/manager";
import { ToolsConnectVSCode, ToolsDisconnecttVSCode } from "../msg-center/event";
import { ScriptController } from "../script/controller";
import { ScriptManager } from "../script/manager";

export class ToolsManager extends Manager {

	protected scriptManager: ScriptManager;
	protected scriptController: ScriptController = new ScriptController();

	protected wsc?: WebSocket;

	constructor(scriptManager: ScriptManager) {
		super();
		this.scriptManager = scriptManager;
	}

	public listenEvent() {
		this.listenerMessage(ToolsConnectVSCode, this.connectVSCode);
		this.listenerMessage(ToolsDisconnecttVSCode, this.connectVSCode);
	}

	public connectVSCode(url: string) {
		return new Promise(resolve => {
			// 与vsc扩展建立连接
			if (this.wsc) {
				this.wsc.close();
			}
			try {
				this.wsc = new WebSocket(url);
			} catch (e: any) {
				return resolve(e.message);
			}
			this.wsc.addEventListener('open', (ev) => {
				this.wsc!.send('Hello Server!');
				resolve(true);
			});

			// Listen for messages
			this.wsc.addEventListener('message', async (ev) => {
				let data = JSON.parse(ev.data);
				switch (data.action) {
					case 'onchange': {
						let code = data.data.script;
						let [newScript, oldScript] = await this.scriptController.prepareScriptByCode(code, data.data.uri);
						if (typeof oldScript === "string") {
							return;
						}
						if (oldScript) {
							this.scriptManager.scriptReinstall(newScript!);
						} else {
							this.scriptManager.scriptInstall(newScript!);
						}
						break;
					}
				}
			});

			this.wsc.addEventListener('error', (ev) => {
				resolve('ws服务连接失败');
			});
		});
	}

	public disconnectVSCode() {
		return new Promise(resolve => {
			if (this.wsc) {
				this.wsc.close();
				this.wsc = undefined;
			}
			resolve(true);
		});
	}

}