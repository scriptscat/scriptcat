import { hash, Resource, ResourceLinkModel, ResourceModel } from "@App/model/resource";
import { SystemConfig } from "@App/pkg/config";
import axios from "axios";
import crypto from "crypto-js";
import { App } from "./app";

export class ResourceManager {
    public model = new ResourceModel();
    public linkModel = new ResourceLinkModel();

    public addResource(url: string, scriptId: number): Promise<boolean> {
        return new Promise(async resolve => {
            let u = this.parseUrl(url);
            this.getResource(u.url).then(async result => {
                if (!result) {
                    let resource = await this.loadByUrl(u.url);
                    if (!resource) {
                        return;
                    }
                    resource.createtime = new Date().getTime();
                    resource.updatetime = new Date().getTime();
                    await App.Cache.set('resource:' + u.url, resource);
                    if (await this.model.save(resource)) {
                        App.Log.Info("resource", u.url, "add");
                    }
                }
            });

            let link = await this.linkModel.findOne({ url: u.url, scriptId: scriptId });
            if (link) {
                return resolve(true);
            }
            let ret = await this.linkModel.save({ id: 0, url: u.url, scriptId: scriptId, createtime: new Date().getTime() });
            if (ret) {
                return resolve(true);
            }
            return resolve(false);
        });
    }

    public getResource(url: string): Promise<Resource | undefined> {
        return new Promise(async resolve => {
            let u = this.parseUrl(url);
            let resource: Resource | undefined = await App.Cache.getOrSet('resource:' + u.url, () => {
                return new Promise(async resolve => {
                    let resource = await this.model.findOne({ url: u.url });
                    resolve(resource);
                });
            });
            if (resource) {
                let newresource: Resource | undefined;
                if ((resource.updatetime || 0) < new Date().getTime() - SystemConfig.check_update_cycle * 1000) {
                    newresource = await this.loadByUrl(u.url);
                    if (newresource) {
                        newresource.id = resource.id;
                        resource = newresource;
                        resource.updatetime = new Date().getTime();
                        if (!await this.model.save(resource)) {
                            return resolve(undefined);
                        }
                        App.Log.Info("resource", u.url, "update");
                        await App.Cache.set('resource:' + u.url, resource);
                    }
                }
                // 校验hash
                if (u.hash) {
                    if ((u.hash['md5'] && u.hash['md5'] != resource.hash.md5) ||
                        (u.hash['sha1'] && u.hash['sha1'] != resource.hash.sha1) ||
                        (u.hash['sha256'] && u.hash['sha256'] != resource.hash.sha256) ||
                        (u.hash['sha384'] && u.hash['sha384'] != resource.hash.sha384) ||
                        (u.hash['sha512'] && u.hash['sha512'] != resource.hash.sha512)) {
                        resource.content = `console.warn("ScriptCat: couldn't load resource from URL ${url} due to a SRI error ");`;
                    }
                }
                return resolve(resource);
            }
            return resolve(undefined);
        });
    }

    public deleteResource(url: string, scriptId: number): Promise<boolean> {
        return new Promise(async resolve => {
            let u = this.parseUrl(url);
            let link = await this.linkModel.findOne({ url: u.url, scriptId: scriptId });
            if (!link) {
                return resolve(false);
            }
            await this.linkModel.delete(link.id);
            let list = await this.linkModel.list(where => {
                return where.where({ url: u.url });
            });
            if (!list.length) {
                this.model.delete({ url: u.url });
            }
            await App.Cache.del('resource:' + u.url)
            return resolve(true);
        });
    }

    public loadByUrl(url: string): Promise<Resource | undefined> {
        return new Promise(async resolve => {
            let u = this.parseUrl(url);
            axios.get(u.url).then(async response => {
                if (response.status != 200) {
                    return resolve(undefined);
                }
                let text = response.data;
                let resource: Resource = {
                    id: 0,
                    url: u.url, content: text,
                    hash: {
                        md5: crypto.MD5(text).toString(),
                        sha1: crypto.SHA1(text).toString(),
                        sha256: crypto.SHA256(text).toString(),
                        sha384: crypto.SHA384(text).toString(),
                        sha512: crypto.SHA512(text).toString(),
                    }
                };
                App.Log.Info("resource", u.url, "load");
                return resolve(resource);
            }).catch(() => {
                return resolve(undefined);
            });
        });
    }

    public parseUrl(url: string): { url: string, hash?: { [key: string]: string } } {
        let urls = url.split("#");
        if (urls.length < 2) {
            return { url: urls[0], hash: undefined };
        }
        let hashs = urls[1].split(/[,;]/);
        let hash: { [key: string]: string } = {};
        hashs.forEach(val => {
            let kv = val.split('=');
            if (kv.length < 2) {
                return
            }
            hash[kv[0]] = kv[1].toLocaleLowerCase();
        });
        return { url: urls[0], hash: hash };
    }
}