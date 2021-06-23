import { Grant } from "./apps/grant/interface";
import { BrowserMsg } from "./apps/msg-center/browser";
import { ScriptExec, ScriptGrant, ScriptValueChange } from "./apps/msg-center/event";
import { MsgCenter } from "./apps/msg-center/msg-center";
import { ScriptCache } from "./model/do/script";

chrome.runtime.sendMessage("runScript", (event: any) => {
    let scripts = <ScriptCache[]>event.scripts;
    let flag = event.flag;
    let browserMsg = new BrowserMsg(flag);

    browserMsg.send('scripts', scripts);
    browserMsg.listen('grant', msg => {
        MsgCenter.connect(ScriptGrant, msg).addListener((msg: Grant, port: chrome.runtime.Port) => {
            browserMsg.send(msg.flag!, msg);
        });
    });
    MsgCenter.connect(ScriptValueChange, 'init').addListener((msg: any) => {
        browserMsg.send(ScriptValueChange, msg);
    })
    chrome.runtime.onMessage.addListener((event) => {
        switch (event.action) {
            case ScriptExec:
                browserMsg.send(ScriptExec, event.uuid);
                break;
        }
    });

});

