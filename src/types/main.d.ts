declare let sandbox: any;

declare module "@App/tampermonkey.d.ts";
declare module "*.tpl";

interface IChangeTitle {
    title: string;
    /** 是否是在新建脚本 */
    initial?: boolean;
    scriptId?: number;
}

interface IEditScript {
    scriptId: number;
}

declare const ScriptFlag;