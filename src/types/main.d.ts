declare let sandbox: Window;

type AnyMap = {
    [key: string]: any
}

type EmptyFunction = () => void

declare module '@App/tampermonkey.d.ts';
declare module '*.tpl';

interface ITabItem {
    tabKey: string | number;
    title?: string | JSX.Element;
    icon?: JSX.Element;
    content?: JSX.Element;
    closable?: boolean;
    lazy?: boolean;
    keepAlive?: boolean;
    scriptId?: number;
    message?: string;
    beforeChange?: (tabPane: TabPane) => Promise<boolean>;
    beforeRemove?: (tabPane: TabPane) => Promise<boolean>;
    template?: 'normal' | 'crontab' | 'background';
}

interface IChangeTitle {
    title: string;
    /** 是否是在新建脚本 */
    initial?: boolean;
    scriptId?: number;
    tabKey: string | number;
}

interface IEditScript {
    scriptId: number;
}


interface INewScript {
    scriptId: number;
    tabKey: string | number;
    template?: 'normal' | 'crontab' | 'background';
    param?: AnyMap
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

declare const ScriptFlag: string;

declare namespace chrome {
    declare namespace clipboard {
        declare function setImageData(
            imageData: ArrayBuffer,
            type: ImageType,
            additionalItems: AdditionalDataItem[],
            callback: function,
        );

        type DataItemType = 'textPlain' | 'textHtml';
        type ImageType = 'png' | 'jpeg';
        declare interface AdditionalDataItem {
            data: string;
            type: DataItemType;
        }
    }
}

declare const top: Window;

interface Userinfo {
    id: number;
    username: string;
    avatar?: string;
}

declare namespace GMSend {
    interface XHRDetails {
        method?: 'GET' | 'HEAD' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'OPTIONS'
        url: string
        headers?: { [key: string]: string }
        data?: string | Array<XHRFormData>
        cookie?: string
        binary?: boolean
        timeout?: number
        context?: CONTEXT_TYPE
        responseType?: 'text' | 'arraybuffer' | 'blob' | 'json'
        overrideMimeType?: string,
        anonymous?: boolean,
        fetch?: boolean,
        user?: string,
        password?: string,
        nocache?: boolean
        dataType?: 'FormData' | 'Blob'
        maxRedirects?: number
    }

    interface XHRFormData {
        type?: 'file' | 'text'
        key: string
        val: string
        filename?: string
    }
}

interface IPermissionConfirm {
    allow: boolean
    type: number
}


declare namespace Panel {
    export interface ConfigItem {
        type: 'text' | 'button' | 'check' | 'select';
        title: string;
        describe?: string;
        color?: string;
        loading?: boolean;
        disabled?: boolean;
        click?: any;
        value?: any;
        change?: any;
    }

    export interface ButtonItem {
        loading: boolean;
        disabled: boolean;
        a: string;
    }

    export interface ConfigGroup {
        items: ConfigItem[];
    }

    export interface PanelConfigs {
        [key: string]: ConfigGroup;
    }
}