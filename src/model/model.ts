import Dexie from "dexie";
import { Page } from "../pkg/utils/utils";

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
            return query.toArray();
        }
        let collect = query.offset((page.page() - 1) * page.count()).limit(page.count());
        if (page.order() !== "id") {
            collect.sortBy(page.order());
        }
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
        return new Promise(async (resolve, reject) => {
            try {
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
            } catch (e) {
                reject(e);
            }
        });
    }

    public findById(id: number) {
        return this.table.get(id);
    }

    public clear() {
        return this.table.clear();
    }

    public async delete(id: number | { [key: string]: any }) {
        if (typeof id == 'number') {
            return this.table.delete(id);
        }
        return this.table.where(id).delete();
    }

    public update(id: number, changes: { [key: string]: any }) {
        return this.table.update(id, changes);
    }

    public count() {
        return this.table.count();
    }
}