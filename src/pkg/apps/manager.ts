import { MessageCallback, MsgCenter } from '@App/apps/msg-center/msg-center';

export class Manager {

	public listenerMessage(topic: string, callback: MessageCallback) {
		MsgCenter.listenerMessage(topic, (body, send, sender) => {
			const ret = callback.call(this, body, send, sender)
			if (ret instanceof Promise) {
				ret.then((ret) => {
					send(ret);
				}).catch(ret => {
					send(ret);
				})
			} else {
				send(ret);
			}
		});
	}

}