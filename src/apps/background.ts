import { ScriptController } from "@App/script/script";

let script = new ScriptController();

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
    let uuid = await script.installScript(url);
    if (uuid != '') {
        chrome.tabs.remove(tabid);
        chrome.tabs.create({
            url: 'install.html?id=' + uuid
        });
    } else {
        chrome.tabs.update(tabid, {
            url: url + "#bypass=true"
        });
    }
}

listenScriptInstall();
