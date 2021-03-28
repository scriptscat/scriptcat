import { ScriptCache } from "./model/script";

chrome.runtime.sendMessage("runScript", resp => {
    let scripts: ScriptCache[] = resp.scripts;
    scripts.forEach(script => {
        
    });
});
