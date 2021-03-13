import { ScriptManager } from "@App/apps/script/manager";
import { BackgroundGrant, grantListener as bgGrantListener } from "@App/apps/grant/background";
import { grantListener } from "@App/apps/grant/content";
import { MultiGrantListener } from "@App/apps/grant/utils";
import { Crontab } from "@App/apps/script/crontab";
import { SCRIPT_TYPE_CRONTAB, SCRIPT_STATUS_ENABLE, Script } from "./model/script";
import { Logger } from "./apps/msg-center/event";
import { SystemConfig } from "./pkg/config";
import { App } from "./apps/app";
import { SystemCache } from "./pkg/cache";

App.Cache = new SystemCache(true);

let scripts = new ScriptManager(new Crontab(<Window>sandbox.window));
let grant = BackgroundGrant.SingleInstance(scripts, new MultiGrantListener(new bgGrantListener(), new grantListener(<Window>sandbox.window)));
scripts.listenMsg();
scripts.listenScript();
grant.listenScriptGrant();
window.addEventListener('message', (event) => {
    if (event.data.action != Logger) {
        return;
    }
    let data = event.data.data;
    App.Log.Logger(data.level, data.origin, data.message, data.title);
})

function listenScriptInstall() {
    chrome.webRequest.onBeforeRequest.addListener((req: chrome.webRequest.WebRequestBodyDetails) => {
        if (req.method != 'GET') {
            return;
        }
        let hash = req.url.split('#').splice(1).join('#');
        if (hash.indexOf('bypass=true') != -1) {
            return;
        }
        installScript(req.tabId, req.url);
        return { redirectUrl: 'javascript:void 0' };
    }, {
        urls: [
            "*://*/*.user.js",
            "*://*/*.user.js?*",
        ],
        types: ["main_frame"],
    }, ["blocking"]);
}

async function installScript(tabid: number, url: string) {
    let info = await scripts.loadScriptByUrl(url);
    if (info != undefined) {
        chrome.tabs.create({
            url: 'install.html?uuid=' + info.uuid
        });
    } else {
        chrome.tabs.update(tabid, {
            url: url + "#bypass=true"
        });
    }
}

listenScriptInstall();

function sandboxLoad(event: MessageEvent) {
    if (event.origin != "null") {
        return;
    }
    if (event.data.action != "load") {
        return;
    }
    //启动定时脚本
    scripts.scriptList({ type: SCRIPT_TYPE_CRONTAB, status: SCRIPT_STATUS_ENABLE }).then(items => {
        items.forEach((value: Script) => {
            scripts.enableScript(value);
        });
    });
    window.removeEventListener('message', sandboxLoad);
}

window.addEventListener('message', sandboxLoad);

// 检查更新
setInterval(() => {
    scripts.scriptList((table: Dexie.Table) => {
        return table.where('checktime').belowOrEqual(new Date().getTime() - SystemConfig.check_update_cycle * 1000);
    }).then(items => {
        items.forEach((value: Script) => {
            scripts.scriptCheckupdate(value);
        });
    });
}, 60000);
