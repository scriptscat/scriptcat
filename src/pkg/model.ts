import Dexie, { PromiseExtended } from "dexie";
import { Page } from "./utils";

export let db = new Dexie("ScriptCat");

export abstract class Model<T> {

    protected table!: Dexie.Table<T, number>;
    protected tableName: string = "";

    public list(query: Dexie.Table<T, number>, page: Page) {
        let collect = query.offset((page.page() - 1) * page.count()).limit(page.count());
        if (page.sort() == "desc") {
            collect = collect.reverse();
        }
        return collect.toArray();
    }

    public find() {
        return this.table;
    }

    public findOne(where: { [key: string]: any }) {
        return this.table.where(where).first();
    }

    public async save(val: T): Promise<T | undefined> {
        return new Promise(async resolve => {
            let id = <number>(<any>val).id;
            if (!id) {
                delete (<any>val).id;
                let key = await this.table.add(val);
                if (key) {
                    (<any>val).id = key;
                    return resolve(val);
                }
                return resolve(undefined);
            }
            if (await this.table.update(id, val)) {
                resolve(val);
            } else {
                resolve(undefined);
            }
        });
    }

    public findById(id: number) {
        return this.table.get(id);
    }

    public delete(id: number) {
        return this.table.delete(id);
    }
}