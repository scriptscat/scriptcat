## API文档
> 本扩展api定义参考[tampermonkey文档](https://www.tampermonkey.net/documentation.php),由于时间和精力问题,只实现了部分api,后续将继续迭代,本扩展特供的API将在文档中特殊标注.对于某些API还提供了同步函数,同步函数规则:GM.*.

#### GM_cookie *

> 部分功能缺失,本扩展特供,操作cookie,只能在后台脚本中使用

```typescript
declare function GM_cookie(action: GM_Types.CookieAction, details: GM_Types.CookieDetails, ondone: (cookie: GM_Types.Cookie[] | any, error: any | undefined) => void): void;

declare namespace GM_Types {
    type CookieAction = "list" | "delete" | "set";
    interface CookieDetails {
        url: string
        name: string
        value?: string
        domain?: string
        path?: string
        secure?: boolean
        httpOnly?: boolean
        expirationDate?: number
    }
    interface Cookie {
        domain: string;
        name: string;
        storeId: string;
        value: string;
        session: boolean;
        hostOnly: boolean;
        expirationDate?: number;
        path: string;
        httpOnly: boolean;
        secure: boolean;
    }
}
```



#### GM_notification *

> 发送消息通知,提供了`progress`能力,可以显示进度条类型的通知,多提供了`GM_closeNotification`,`GM_updateNotification`两个方法.
>
> [demo](https://bbs.tampermonkey.net.cn/thread-403-1-1.html)



```typescript
declare function GM_notification(details: GM_Types.NotificationDetails, ondone: Function): void;
declare function GM_notification(text: string, title: string, image: string, onclick: Function): void;
declare function GM_closeNotification(id: string): void;
declare function GM_updateNotification(id: string, details: GM_Types.NotificationDetails): void;

declare namespace GM_Types {
    type NotificationOnClick = (this: NotificationThis, id: string) => any;
    type NotificationOnDone = (this: NotificationThis, clicked: boolean, id: string) => any;

    interface NotificationDetails {
        text?: string
        title?: string
        image?: string
        highlight?: boolean
        silent?: boolean
        timeout?: number
        onclick?: NotificationOnClick
        ondone?: NotificationOnDone
        progress?: number
        oncreate?: NotificationOnClick
    }

}
```

#### GM_xmlhttpRequest

> 部分功能缺失

```typescript
declare function GM_xmlhttpRequest(details: GM_Types.XHRDetails): GM_Types.AbortHandle<void>;

declare namespace GM_Types {
    interface XHRResponse {
        finalUrl?: string,
        readyState?: 0 | 1 | 2 | 3 | 4,
        responseHeaders?: string,
        status?: number,
        statusText?: string,
        response?: any,
        responseText?: string,
        responseXML?: Document | null
    }

    interface XHRProgress extends XHRResponse {
        done: number,
        lengthComputable: boolean,
        loaded: number,
        position: number,
        total: number,
        totalSize: number
    }

    type Listener<OBJ> = (event: OBJ) => any;

    interface XHRDetails {
        method?: "GET" | "HEAD" | "POST",
        url?: string,
        headers?: { readonly [key: string]: string },
        data?: string,
        binary?: boolean,
        timeout?: number,
        context?: CONTEXT_TYPE,
        responseType?: "arraybuffer" | "blob" | "json",
        overrideMimeType?: string,
        anonymous?: boolean,
        fetch?: boolean,
        username?: string,
        password?: string,

        onload?: Listener<XHRResponse>,
        onloadstart?: Listener<XHRResponse>,
        onprogress?: Listener<XHRProgress>,
        onreadystatechange?: Listener<XHRResponse>,
        ontimeout?: Listener<Function>,
        onabort?: Function,
        onerror?: Function
    }
}
```

#### GM.fetch

> 功能缺失



#### GM_log
> 日志函数,日志将在控制面板的运行日志中看到

```typescript
declare function GM_log(message: string, level?: GM_Types.LOGGER_LEVEL): any;
declare namespace GM_Types {
    type LOGGER_LEVEL = 'debug' | 'info' | 'warn' | 'error';
}
```

#### GM_get/setValue
> 从储存中获取或者设置值,数据在同一`namespace`中可以共享,但是不能实时同步

```ts
declare function GM_setValue(name: string, value: any): void;

declare function GM_getValue(name: string, defaultValue?: any): any;
```

