// splitChunks对injected可能会有问题

import { FrontendGrant, ScriptContext } from "./apps/grant/frontend";
import { BrowserMsg } from "./apps/msg-center/browser";
import { ScriptCache } from "./model/script";
import { createContext } from "./pkg/sandbox";

let browserMsg = new BrowserMsg(ScriptFlag);

browserMsg.listen("scripts", (msg) => {
    let scripts: ScriptCache[] = msg;
    scripts.forEach(script => {

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

})
