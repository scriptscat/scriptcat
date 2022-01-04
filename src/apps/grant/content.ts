import { App } from '../app';
import { IGrantListener, IPostMessage } from './interface';

class postMessage implements IPostMessage {

    public event: MessageEvent;
    public context: Window;

    constructor(context: Window, event: MessageEvent) {
        this.event = event;
        this.context = context;
    }

    public postMessage(msg: any): void {
        this.context.postMessage(msg, '*');
    }

    public sender(): any {
        return undefined;
    }
}

export class grantListener implements IGrantListener {

    public context: Window;

    constructor(context: Window) {
        this.context = context;
    }

    public listen(callback: (msg: any, postMessage: IPostMessage) => Promise<any>): void {
        window.addEventListener('message', async event => {
            if (event.origin != 'null' && event.origin != App.ExtensionId) {
                return;
            }
            const post = new postMessage(this.context, event);
            const ret = await callback(event.data, post);
            if (ret) {
                post.postMessage(ret);
            }
        });
    }
}
