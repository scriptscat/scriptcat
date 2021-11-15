import { Manager } from "@App/pkg/apps/manager";
import { SystemConfig } from "@App/pkg/config";
import { ExternalWhitelist } from "../config";
import { ExternalMessage, ToolsConnectVSCode, ToolsDisconnecttVSCode } from "../msg-center/event";
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
		// 每30秒检测一次自动连接vscode
		setInterval(() => {
			if (SystemConfig.vscode_reconnect && !this.wsc) {
				this.connectVSCode(SystemConfig.vscode_url);
			}
		}, 3e4);

		this.listenerMessage(ToolsConnectVSCode, this.connectVSCode);
		this.listenerMessage(ToolsDisconnecttVSCode, this.connectVSCode);

		this.listenerMessage(ExternalMessage, this.externalMessage);
	}

	public externalMessage(body: any, sendResponse: (response?: any) => void, sender?: chrome.runtime.MessageSender) {
		return new Promise(async resolve => {
			// 对外接口白名单
			let u = new URL(sender?.url!);
			for (let i = 0; i < ExternalWhitelist.length; i++) {
				if (u.host.endsWith(ExternalWhitelist[i])) {
					switch (body.action) {
						case "isInstalled":
							let script = await this.scriptController.scriptModel.findByNameAndNamespace(body.params.name, body.params.namespace);
							if (script) {
								resolve({ action: 'isInstalled', data: { installed: true, version: script.metadata['version'] && script.metadata['version'][0] } });
							} else {
								resolve({ action: 'isInstalled', data: { installed: false } });
							}
					}
					return;
				}
			}
		});
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
				this.wsc!.send('{"action":"hello"}');
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
				this.wsc = undefined;
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