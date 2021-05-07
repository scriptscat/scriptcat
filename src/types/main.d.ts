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

interface INewScript {
    scriptId: number;
}

interface IUpdateMeta {
    code: string;
    name: string;
    metadata: any;
}

interface ISave {
    currentCode: string;
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
