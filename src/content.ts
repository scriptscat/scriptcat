import { Grant } from './apps/grant/interface';
import { FrontendMsg } from './apps/msg-center/browser';
import { ExternalMessage, ScriptExec, ScriptGrant, ScriptValueChange } from './apps/msg-center/event';
import { MsgCenter } from './apps/msg-center/msg-center';
import { ScriptCache } from './model/do/script';

chrome.runtime.sendMessage('runScript', (event: unknown) => {
    const { flag, scripts } = (<{ scripts: ScriptCache[], flag: string }>event);
    const browserMsg = new FrontendMsg(flag, true);

    browserMsg.send('scripts', scripts);
    browserMsg.listen('grant', (msg: { value: string, params: any[], flag: string, data: any }) => {
        const handler = async () => {
            switch (msg.value) {
                case 'CAT_fetchBlob':
                    const resp = await (await fetch(<RequestInfo>msg.params[0])).blob();
                    msg.data = (<{ cloneInto?: (detail: any, view: any) => any }><unknown>global).cloneInto ?
                        (<{ cloneInto: (detail: any, view: any) => any }><unknown>global).cloneInto(resp, document.defaultView) : resp;
                    browserMsg.send(msg.flag, msg);
                    break;
                default:
                    // NOTE: 好像没处理释放问题
                    MsgCenter.connect(ScriptGrant, msg).addListener((msg: Grant) => {
                        browserMsg.send(msg.flag || '', msg);
                    });
            }
        }
        void handler();
    });
    MsgCenter.connect(ScriptValueChange, 'init').addListener((msg: any) => {
        browserMsg.send(ScriptValueChange, msg);
    });
    browserMsg.listen(ExternalMessage, msg => {
        MsgCenter.connect(ExternalMessage, msg).addListener((msg) => {
            browserMsg.send(ExternalMessage, msg);
        });
    });
    chrome.runtime.onMessage.addListener((event: { action: string, uuid: string }) => {
        switch (event.action) {
            case ScriptExec:
                browserMsg.send(ScriptExec, event.uuid);
                break;
        }
    });

    // 处理blob
    browserMsg.listen('fetchBlob', (msg: { url: string, id: string }) => {
        const handler = async () => {
            const ret = await fetch(msg.url);
            browserMsg.send('fetchBlob', { url: msg.url, id: msg.id, ret });
        }
        void handler();
    })
});


