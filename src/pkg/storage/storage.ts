
export interface Storage {
    //build key
    buildKey(key: string): string
    //get a key-value pair
    get(key: string): Promise<any>
    //store a key-value pair
    set(key: string, value: any): Promise<void>
    //remove a single key
    remove(key: string): Promise<void>
    //remove all keys
    removeAll(): Promise<void>
    //search key by prefix
    keys(prefix: string): Promise<Map<string, any>>
}

