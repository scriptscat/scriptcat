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
let grant = BackgroundGrant.SingleInstance(
    scripts,
    new MultiGrantListener(new bgGrantListener(), new grantListener(<Window>sandbox.window)),
    false
);
scripts.listenEvent();
scripts.listen();
scripts.listenScriptMath();
grant.listenScriptGrant();
window.addEventListener("message", (event) => {
    if (event.data.action != Logger) {
        return;
    }
    let data = event.data.data;
    App.Log.Logger(data.level, data.origin, data.message, data.title, data.scriptId);
});

function sandboxLoad(event: MessageEvent) {
    if (event.origin != "null" && event.origin != App.ExtensionId) {
        return;
    }
    if (event.data.action != "load") {
        return;
    }
    scripts.scriptList({ status: SCRIPT_STATUS_ENABLE }).then((items) => {
        items.forEach((value: Script) => {
            scripts.enableScript(value);
        });
    });
    window.removeEventListener("message", sandboxLoad);
}

window.addEventListener("message", sandboxLoad);

// 检查更新
setInterval(() => {
    scripts
        .scriptList((table: Dexie.Table) => {
            return table
                .where("checktime")
                .belowOrEqual(new Date().getTime() - SystemConfig.check_update_cycle * 1000);
        })
        .then((items) => {
            items.forEach((value: Script) => {
                scripts.scriptCheckUpdate(value.id);
            });
        });
}, 60000);

// 十分钟检查一次扩展更新
get(Server + "api/v1/system/version", (str) => {
    chrome.storage.local.get(['oldNotice'], items => {
        let resp = JSON.parse(str);
        if (resp.data.notice !== items['oldNotice']) {
            chrome.storage.local.set({
                notice: resp.data.notice
            });
        }
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
        });
    });
}, 600000)


process.env.NODE_ENV === "production" && chrome.runtime.onInstalled.addListener((details) => {
    if (details.reason == "install") {
        chrome.tabs.create({ url: "https://docs.scriptcat.org/" });
    } else if (details.reason == "update") {
        chrome.tabs.create({ url: "https://docs.scriptcat.org/change/" });
    }
});
