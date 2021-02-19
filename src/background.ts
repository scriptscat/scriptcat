import { Scripts } from "@App/apps/script/scripts";
import { SCRIPT_TYPE_CRONTAB, SCRIPT_STATUS_ENABLE, Script } from "./model/script";

let scripts = new Scripts();
scripts.listenMsg();
scripts.listenScriptUpdate();

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

//启动定时脚本
scripts.scriptList({ type: SCRIPT_TYPE_CRONTAB, status: SCRIPT_STATUS_ENABLE }).then(items => {
    items.forEach((value: Script, index: number) => {
        scripts.enableScript(value);
    });
});
