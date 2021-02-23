
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
