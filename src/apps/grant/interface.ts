import { Script } from "@App/model/script";

export interface Grant {
    value: string
    params: any[]
    request: string
    id: number
    data?: any
    error?: string
}

export interface IPostMessage {
    postMessage(msg: any): void
}

export type Api = (grant: Grant, postMessage: IPostMessage) => Promise<any>;


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
    // 通配内容
    wildcard?: string
}

export interface PermissionParam {
    // 默认提供的函数
    default?: boolean
    // 是否只有沙盒环境中才能执行
    sandbox?: boolean
    // 是否需要弹出页面让用户进行确认
    confirm?: (grant: Grant, script: Script) => Promise<ConfirmParam | undefined>
}
