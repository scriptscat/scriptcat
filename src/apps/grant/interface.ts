import { AxiosRequestConfig } from "axios";

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

export interface GM_xmlhttpRequestDetails extends AxiosRequestConfig {
    cookie?: string
    onload?: (respond: GM_xmlhttpRespond) => void
}

export interface GM_xmlhttpRespond {
    finalUrl?: string
    readyState?: string
    status: number
    statusText: string
    responseHeaders: any
    response: string
    responseXML?: string
    responseText: string
}
