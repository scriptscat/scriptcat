import { FrontenApiValue, SandboxContext, ScriptContext } from '@App/apps/grant/frontend';
import { ScriptCache, Script } from '@App/model/do/script';

// 编译脚本代码字符串
export function compileScriptCode(script: ScriptCache): string {
	let code = script.code;
	let require = '';
	script.metadata['require'] && script.metadata['require'].forEach((val) => {
		const res = script.resource[val];
		if (res) {
			require = require + '\n' + res.content;
		}
	});
	code = require + code;
	return 'with (context) return ((context, fapply, CDATA, uneval, define, module, exports)=>{\n' +
		code + '\n//# sourceURL=' + chrome.runtime.getURL('/' + encodeURI(script.name) + '.user.js') +
		'\n})(context)'
}

// 编译成脚本方法
export function compileScript(script: ScriptCache): any {
	return new Function('context', script.code);
}

// 设置api依赖
function setDepend(context: ScriptContext, apiVal: FrontenApiValue) {
	if (apiVal.param.depend) {
		for (let i = 0; i < apiVal.param.depend.length; i++) {
			const value = apiVal.param.depend[i];
			const dependApi = context.getApi(value);
			if (!dependApi) {
				return;
			}
			if (value.startsWith('GM.')) {
				const [_, t] = value.split('.');
				(<{ [key: string]: any }>context['GM'])[t] = dependApi.api.bind(context);
			} else {
				context[value] = dependApi.api.bind(context);
			}
			setDepend(context, dependApi);
		}
	}
}

// 创建沙盒
export function createSandboxContext(script: ScriptCache): SandboxContext {
	const context: SandboxContext = new SandboxContext(script);
	return <SandboxContext>createContext(context, script);
}

export function createContext(context: ScriptContext, script: Script): ScriptContext {
	context['postRequest'] = context.postRequest;
	context['script'] = context.script;
	if (script.metadata['grant']) {
		context['GM'] = context;
		script.metadata['grant'].forEach((value: string) => {
			const apiVal = context.getApi(value);
			if (!apiVal) {
				return;
			}
			if (value.startsWith('GM.')) {
				const [_, t] = value.split('.');
				(<{ [key: string]: any }>context['GM'])[t] = apiVal.api.bind(context);
			} else {
				context[value] = apiVal.api.bind(context);
			}
			setDepend(context, apiVal);
		});
	}
	context['GM_info'] = context.GM_info();

	// 去除原型链
	return Object.assign({}, context);
}
