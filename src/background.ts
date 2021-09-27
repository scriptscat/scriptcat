import { ScriptManager } from "@App/apps/script/manager";
import { BackgroundGrant, grantListener as bgGrantListener } from "@App/apps/grant/background";
import { grantListener } from "@App/apps/grant/content";
import { MultiGrantListener } from "@App/apps/grant/utils";
import { Logger } from "./apps/msg-center/event";
import { SystemConfig } from "./pkg/config";
import { App, InitApp } from "./apps/app";
import { DBLogger } from "./apps/logger/logger";
import { migrate } from "./model/migrate";
import { SCRIPT_STATUS_ENABLE, Script, SCRIPT_TYPE_NORMAL } from "./model/do/script";
import { MapCache } from "./pkg/storage/cache/cache";
import { get } from "./pkg/utils";
import { Server } from "./apps/config";
import { Subscribe } from "./model/do/subscribe";
import { UserManager } from "./apps/user/manager";

migrate();

InitApp({
    Log: new DBLogger(),
    Cache: new MapCache(),
});

chrome.contextMenus.create({
    id: 'script-cat',
    title: "ScriptCat",
    contexts: ['all'],
    onclick: () => {
        console.log('exec script');
    },
});

let scripts = new ScriptManager();
let user = new UserManager();
let grant = BackgroundGrant.SingleInstance(
    scripts,
    new MultiGrantListener(new bgGrantListener(), new grantListener(<Window>sandbox.window)),
    false
);
scripts.listenEvent();
scripts.listen();
scripts.listenScriptMath();

user.listenEvent();

grant.listenScriptGrant();
window.addEventListener("message", (event) => {
    if (event.data.action != Logger) {
        return;
    }
    let data = event.data.data;
    App.Log.Logger(data.level, data.origin, data.message, data.title, data.scriptId);
});

let timer = setInterval(() => {
    sandbox.postMessage({ action: 'load' }, '*');
}, 1000);
window.addEventListener("message", sandboxLoad);
function sandboxLoad(event: MessageEvent) {
    clearInterval(timer);
    window.removeEventListener("message", sandboxLoad);
    if (event.origin != "null" && event.origin != App.ExtensionId) {
        return;
    }
    if (event.data.action != "load") {
        return;
    }
    scripts.scriptList({ status: SCRIPT_STATUS_ENABLE }).then((items) => {
        items.forEach((script: Script) => {
            scripts.enableScript(script);
        });
    });
}

// 检查更新
setInterval(() => {

    scripts.scriptList((table: Dexie.Table) => {
        return table
            .where("checktime")
            .belowOrEqual(new Date().getTime() - SystemConfig.check_update_cycle * 1000);
    }).then((items) => {
        items.forEach((value: Script) => {
            scripts.scriptCheckUpdate(value.id);
        });
    });

    scripts.subscribeList((table: Dexie.Table) => {
        return table
            .where("checktime")
            .belowOrEqual(new Date().getTime() - SystemConfig.check_update_cycle * 1000);
    }).then((items) => {
        items.forEach((value: Subscribe) => {
            scripts.subscribeCheckUpdate(value.id);
        });
    });

}, 60000);

// 十分钟检查一次扩展更新
get(Server + "api/v1/system/version", (str) => {
    chrome.storage.local.get(['oldNotice'], items => {
        let resp = JSON.parse(str);
        if (resp.data.notice !== items['oldNotice']) {
            chrome.storage.local.set({
                notice: resp.data.notice,
            });
        }
        chrome.storage.local.set({
            version: resp.data.version,
        });
    });
});
setInterval(() => {
    get(Server + "api/v1/system/version", (str) => {
        chrome.storage.local.get(['oldNotice'], items => {
            let resp = JSON.parse(str);
            if (resp.data.notice !== items['oldNotice']) {
                chrome.storage.local.set({
                    notice: resp.data.notice
                });
            }
            chrome.storage.local.set({
                version: resp.data.version,
            });
        });
    });
}, 600000)
// 半小时同步一次数据
setInterval(() => {
    user.sync();
}, 1800000);

process.env.NODE_ENV === "production" && chrome.runtime.onInstalled.addListener((details) => {
    if (details.reason == "install") {
        chrome.tabs.create({ url: "https://docs.scriptcat.org/" });
    } else if (details.reason == "update") {
        chrome.tabs.create({ url: "https://docs.scriptcat.org/change/" });
    }
});
