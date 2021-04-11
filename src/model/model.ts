import Dexie, { PromiseExtended } from "dexie";
import { Page } from "../pkg/utils";

export let db = new Dexie("ScriptCat");

export abstract class Model<T> {

    public table!: Dexie.Table<T, number>;
    public tableName: string = "";
    public list(query: Dexie.Collection | Dexie.Table | Page | ((where: Dexie.Table) => Dexie.Collection), page?: Page) {
        if (query instanceof Page) {
            page = query;
            query = this.table;
        } else if (typeof query == 'function') {
            query = query(this.table);
        }
        if (!page) {
            page = new Page(1, 20);
        }
        if (page.page() == 0 && page.count() == 0) {
            return query.toArray();
        }
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

    public async delete(id: number | { [key: string]: any }) {
        if (typeof id == 'number') {
            return this.table.delete(id);
        }
        let ret = await this.findOne(id);
        if (!ret) {
            return undefined;
        }
        return this.table.delete((<any>ret).id);
    }

    public update(id: number, changes: { [key: string]: any }) {
        return this.table.update(id, changes);
    }
}