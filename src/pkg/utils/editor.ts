//@ts-ignore
import dts from "@App/types/tampermonkey.d.ts";
import { CancellationToken, editor, languages, Position } from "monaco-editor";

export function registerEditorPrompt() {
	// @ts-ignore
	self.MonacoEnvironment = {
		getWorkerUrl: function (moduleId: any, label: any) {
			if (label === "typescript" || label === "javascript") {
				return "./src/ts.worker.js";
			}
			return "./src/editor.worker.js";
		},
	};

	languages.typescript.javascriptDefaults.addExtraLib(dts, "tampermonkey.d.ts");

	// 悬停提示
	const prompt: { [key: string]: any } = {
		'name': '脚本名称',
		'description': '脚本描述',
		'namespace': '脚本命名空间',
		'version': '脚本版本',
		'author': '脚本作者',
		'background': '后台脚本',
	};

	languages.registerHoverProvider('javascript', {
		provideHover: (model, position, token) => {
			return new Promise(resolve => {
				const line = model.getLineContent(position.lineNumber);
				let flag = /^\/\/\s*@(\w+?)(\s+(.*?)|)$/.exec(line);
				if (flag) {
					return resolve({
						contents: [{ value: prompt[flag[1]] }]
					});
				}
				// 匹配==UserScript==
				if (/==UserScript==/.test(line)) {
					return resolve({
						contents: [{ value: '一个用户脚本' }],
					});
				}
				return resolve(null);
			});
		}
	});
}
