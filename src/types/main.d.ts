declare let sandbox: any;

declare module "@App/tampermonkey.d.ts";
declare module "*.tpl";

interface ITabItem {
    tabKey: string | number;
    title?: string | JSX.Element;
    icon?: JSX.Element;
    content?: JSX.Element;
    closable?: boolean;
    lazy?: boolean;
    keepAlive?: boolean;
    scriptId?: number;
    message?: string,
    beforeChange?: (tabPane: TabPane) => Promise<boolean>;
    beforeRemove?: (tabPane: TabPane) => Promise<boolean>;
}

interface IChangeTitle {
    title: string;
    /** 是否是在新建脚本 */
    initial?: boolean;
    scriptId?: number;
}

interface IEditScript {
    scriptId: number;
}


interface ICreateScript {

}

interface INewScript {
    scriptId: number;
}

interface IUpdateMeta {
    code: string;
    name: string;
    metadata: any;
}

interface ISaveScript {
    currentCode: string;
    debug: boolean;
}

interface IInitialScript {
    scriptId: number;
}

interface ICodeChange {
    scriptId: number;
}

declare const ScriptFlag;

declare module chrome {
    declare module clipboard {
        declare function setImageData(
            imageData: ArrayBuffer,
            type: ImageType,
            additionalItems: AdditionalDataItem[],
            callback: function,
        );

        type DataItemType = "textPlain" | "textHtml";
        type ImageType = "png" | "jpeg";
        declare interface AdditionalDataItem {
            data: string;
            type: DataItemType;
        }
    }
}

declare var top: Window;
