import { ScriptManager } from '@App/apps/script/manager';
import { BackgroundGrant, grantListener as bgGrantListener } from '@App/apps/grant/background';
import { grantListener } from '@App/apps/grant/content';
import { MultiGrantListener } from '@App/apps/grant/utils';
import { Logger } from './apps/msg-center/event';
import { SystemConfig } from './pkg/config';
import { App, ENV_BACKGROUND, InitApp } from './apps/app';
import { DBLogger } from './apps/logger/logger';
import { migrate } from './model/migrate';
import { SCRIPT_STATUS_ENABLE, Script, SCRIPT_STATUS_DISABLE } from './model/do/script';
import { MapCache } from './pkg/storage/cache/cache';
import { get } from './pkg/utils/utils';
import { Server } from './apps/config';
import { Subscribe, SUBSCRIBE_STATUS_ENABLE } from './model/do/subscribe';
import { UserManager } from './apps/user/manager';
import { ToolsManager } from './apps/tools/manager';

migrate();

InitApp({
    Log: new DBLogger(),
    Cache: new MapCache(),
    Environment: ENV_BACKGROUND,
});

void SystemConfig.init();

chrome.contextMenus.create({
    id: 'script-cat',
    title: 'ScriptCat',
    contexts: ['all'],
    onclick: () => {
        console.log('exec script');
    },
});

const scripts = new ScriptManager();
const user = new UserManager();
const tools = new ToolsManager(scripts);
const grant = BackgroundGrant.SingleInstance(
    scripts,
    new MultiGrantListener(new bgGrantListener(), new grantListener(sandbox.window)),
    false
);
scripts.listenEvent();
scripts.listen();
scripts.listenScriptMath();

user.listenEvent();

tools.listenEvent();

grant.listenScriptGrant();
window.addEventListener('message', (event) => {
    if (event.data.action != Logger) {
        return;
    }
    const data = event.data.data;
    App.Log.Logger(data.level, data.origin, data.message, data.title, data.scriptId);
});

const timer = setInterval(() => {
    sandbox.postMessage({ action: 'load' }, '*');
}, 1000);
window.addEventListener('message', sandboxLoad);
function sandboxLoad(event: MessageEvent) {
    clearInterval(timer);
    window.removeEventListener('message', sandboxLoad);
    if (event.origin != 'null' && event.origin != App.ExtensionId) {
        return;
    }
    if (event.data.action != 'load') {
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

    if (SystemConfig.check_script_update_cycle === 0) {
        return;
    }

    scripts.scriptList((table: Dexie.Table) => {
        return table
            .where('checktime')
            .belowOrEqual(new Date().getTime() - SystemConfig.check_script_update_cycle * 1000);
    }).then((items) => {
        items.forEach((value: Script) => {
            if (!SystemConfig.update_disable_script && value.status == SCRIPT_STATUS_DISABLE) {
                return;
            }
            scripts.scriptCheckUpdate(value.id);
        });
    });

    scripts.subscribeList((table: Dexie.Table) => {
        return table
            .where('checktime')
            .belowOrEqual(new Date().getTime() - SystemConfig.check_script_update_cycle * 1000);
    }).then((items) => {
        items.forEach((value: Subscribe) => {
            if (value.status == SUBSCRIBE_STATUS_ENABLE) {
                scripts.subscribeCheckUpdate(value.id);
            }
        });
    });

}, 60000);

get(Server + 'api/v1/system/version', (str) => {
    chrome.storage.local.get(['oldNotice'], items => {
        const resp = JSON.parse(str);
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
// 半小时同步一次数据和检查更新
setInterval(() => {
    get(Server + 'api/v1/system/version', (str) => {
        chrome.storage.local.get(['oldNotice'], items => {
            const resp = JSON.parse(str);
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
    if (SystemConfig.enable_auto_sync) {
        user.sync();
    }
}, 1800000);

chrome.runtime.onInstalled.addListener((details) => {
    if (details.reason == 'install') {
        chrome.tabs.create({ url: 'https://docs.scriptcat.org/' });
    } else if (details.reason == 'update') {
        chrome.tabs.create({ url: 'https://docs.scriptcat.org/change/' });
    }
});
