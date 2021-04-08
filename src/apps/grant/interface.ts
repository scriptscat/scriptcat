import { Script } from "@App/model/script";

export interface Grant {
    value: string
    params: any[]
    request: string
    id: number
    name: string
    data?: any
    error?: string
    errorMsg?: string
    flag?: string
    tabId?: number
}

export interface IPostMessage {
    sender(): any
    postMessage(msg: any): void
}

export type Api = (grant: Grant, postMessage: IPostMessage, script?: Script) => Promise<any>;

export type FreedCallback = (grant: Grant) => void;

export interface IGrantListener {
    listen(callback: (msg: any, postMessage: IPostMessage) => Promise<any>): void
}

export interface ConfirmParam {
    // 权限名
    permission?: string
    // 权限值
    permissionValue?: string
    // 确认权限标题
    title?: string
    // 权限详情内容
    metadata?: { [key: string]: string }
    // 权限描述
    describe?: string
    // 是否通配
    wildcard?: boolean
    // 权限内容
    permissionContent?: string
}

export interface PermissionParam {
    // 默认提供的函数
    default?: boolean
    // 是否只有后台环境中才能执行
    background?: boolean
    // 是否需要弹出页面让用户进行确认
    confirm?: (grant: Grant, script: Script) => Promise<ConfirmParam | undefined>
    // 监听方法
    listener?: () => void
    // 别名
    alias?: string[]
    // 执行完毕释放资源
    freed?: FreedCallback
}
