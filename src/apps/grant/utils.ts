import { Script } from '@App/model/do/script';
import { App } from '../app';
import { Api, Grant, IGrantListener, IPostMessage } from './interface';

export class MultiGrantListener implements IGrantListener {
    public listeners: IGrantListener[] = [];

    constructor(...l: IGrantListener[]) {
        this.listeners = l;
    }

    public listen(callback: (msg: any, postMessage: IPostMessage) => Promise<any>): void {
        this.listeners.forEach(val => {
            val.listen(callback);
        });
    }

}

export function execMethod(propertyName: string, name: string, resolve: (arg0: any) => void, reject: (arg0: any) => void,
    method: Api, _this: any, grant: Grant, post: IPostMessage, script: Script): any {
    return method.apply(_this, [grant, post, script]).then((result: any) => {
        grant.data = result;
        resolve(grant);
    }).catch((e: any) => {
        App.Log.Error('script', 'call function error: ' + propertyName, name);
        reject(e);
    });
}

export function getIcon(script: Script): string {
    return (script.metadata['icon'] && script.metadata['icon'][0])
        || (script.metadata['iconurl'] && script.metadata['iconurl'][0])
        || (script.metadata['defaulticon'] && script.metadata['defaulticon'][0])
        || (script.metadata['icon64'] && script.metadata['icon64'][0])
        || (script.metadata['icon64url'] && script.metadata['icon64url'][0]);
}
