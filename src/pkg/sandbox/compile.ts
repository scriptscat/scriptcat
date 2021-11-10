import { SandboxContext, ScriptContext } from "@App/apps/grant/frontend";
import { ScriptCache, Script } from "@App/model/do/script";

export function compileScriptCode(script: ScriptCache): string {
	let code = script.code;
	let require = '';
	script.metadata['require'] && script.metadata['require'].forEach((val) => {
		let res = script.resource[val];
		if (res) {
			require = require + "\n" + res.content;
		}
	});
	code = require + code;
	return 'with (context) return ((context, fapply, CDATA, uneval, define, module, exports)=>{\n' +
		code + '\n//# sourceURL=' + chrome.runtime.getURL('/' + encodeURI(script.name) + '.user.js') +
		'\n})(context)'
}

export function compileScript(script: ScriptCache): Function {
	return new Function('context', script.code);
}

function setDepend(context: ScriptContext, apiVal: { [key: string]: any }) {
	if (apiVal.param.depend) {
		for (let i = 0; i < apiVal.param.depend.length; i++) {
			let value = apiVal.param.depend[i];
			let dependApi = context.getApi(value);
			if (!dependApi) {
				return;
			}
			if (value.startsWith("GM.")) {
				let [_, t] = value.split(".");
				context["GM"][t] = dependApi.api;
			} else {
				context[value] = dependApi.api;
			}
			setDepend(context, dependApi);
		}
	}
}

export function createSandboxContext(script: ScriptCache): SandboxContext {
	let context: SandboxContext = new SandboxContext(script);
	return <SandboxContext>createContext(context, script);
}

export function createContext(context: ScriptContext, script: Script): ScriptContext {
	context['postRequest'] = context.postRequest;
	context['script'] = context.script;
	if (script.metadata["grant"]) {
		context["GM"] = context;
		script.metadata["grant"].forEach((value: any) => {
			let apiVal = context.getApi(value);
			if (!apiVal) {
				return;
			}
			if (value.startsWith("GM.")) {
				let [_, t] = value.split(".");
				context["GM"][t] = apiVal.api;
			} else {
				context[value] = apiVal.api;
			}
			setDepend(context, apiVal);
		});
	}
	context['GM_info'] = context.GM_info();

	// 去除原型链
	return Object.assign({}, context);
}
