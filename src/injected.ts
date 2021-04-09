// splitChunks对injected可能会有问题

import { FrontendGrant, ScriptContext } from "./apps/grant/frontend";
import { BrowserMsg } from "./apps/msg-center/browser";
import { ScriptValueChange } from "./apps/msg-center/event";
import { ScriptCache } from "./model/script";
import { Value } from "./model/value";
import { createContext } from "./pkg/sandbox";

let browserMsg = new BrowserMsg(ScriptFlag);
browserMsg.listen("scripts", (msg) => {
    let scripts: ScriptCache[] = msg;
    scripts.forEach(script => {
        browserMsg.listen(ScriptValueChange, (msg: Value) => {
            scripts.forEach(val => {
                if (!val.value) {
                    val.value = {};
                }
                if (val.namespace && val.namespace == msg.namespace) {
                    val.value[msg.key] = msg;
                } else if (val.id = val.id) {
                    val.value[msg.key] = msg;
                }
            })
        });
        Object.defineProperty(window, script.flag!, {
            get: () => { return undefined; },
            set: (val) => {
                // 构建沙盒
                let context: ScriptContext = {};
                if (script.grantMap!['none']) {
                    context['window'] = window;
                } else {
                    context = new FrontendGrant(script, browserMsg);
                    context = createContext(context, script);
                    context['window'] = 'notfound';
                    if (script.grantMap!['unsafeWindow']) {
                        context['unsafeWindow'] = window;
                    }
                }
                val(context);
            }
        });

    });

});