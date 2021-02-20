import { AxiosRequestConfig } from "axios";

export interface Grant {
    value: string
    params: any[]
    request: string
    id?: number
    data?: any
}


export interface GM_xmlhttpRequestDetails extends AxiosRequestConfig {
    cookie?: string
}

