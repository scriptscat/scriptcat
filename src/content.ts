import { Grant } from "./apps/grant/interface";
import { BrowserMsg } from "./apps/msg-center/browser";
import { ScriptGrant } from "./apps/msg-center/event";
import { MsgCenter } from "./apps/msg-center/msg-center";
import { ScriptCache } from "./model/script";

chrome.runtime.sendMessage("runScript", (event) => {
    let scripts = event.scripts;
    let flag = event.flag;
    let browserMsg = new BrowserMsg(flag);

    browserMsg.send('scripts', scripts);
    browserMsg.listen('grant', msg => {
        MsgCenter.connect(ScriptGrant, msg).addListener((msg: Grant, port: chrome.runtime.Port) => {
            browserMsg.send(msg.flag!, msg);
        });
    });
});

