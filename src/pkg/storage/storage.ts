export type CHANGE_EVENT = 1 | 2 | 3;

export const ADD_CHANGE_EVENT = 1;
export const UPDATE_CHANGE_EVENT = 2;
export const DELETE_CHANGE_EVENT = 3;

export type ChangeCallback = (event: CHANGE_EVENT, key: string, data: any, oldData: any) => void

export interface Storage {
    // get a key-value pair
    get(key: string): Promise<any>
    // store a key-value pair
    set(key: string, value: any): Promise<void>
    // remove a single key
    remove(key: string): Promise<void>
    // remove all keys
    removeAll(): Promise<void>
    // search key by prefix
    keys(): Promise<{ [key: string]: any }>

    listenChange(callback: ChangeCallback): void;
}

