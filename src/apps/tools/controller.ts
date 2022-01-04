import { ToolsConnectVSCode, ToolsDisconnecttVSCode } from '../msg-center/event';
import { MsgCenter } from '../msg-center/msg-center';

export class ToolsController {

	public connectVScode(url: string) {
		return new Promise(resolve => {
			MsgCenter.sendMessage(ToolsConnectVSCode, url, resp => {
				resolve(resp);
			});
		});
	}

	public disconnectVScode(url: string) {
		return new Promise(resolve => {
			MsgCenter.sendMessage(ToolsDisconnecttVSCode, undefined, resp => {
				resolve(resp);
			});
		});
	}

}