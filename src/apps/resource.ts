import { Resource, ResourceLinkModel, ResourceModel } from "@App/model/resource";
import { SystemConfig } from "@App/pkg/config";
import axios from "axios";
import crypto from "crypto-js";
import { App } from "./app";

export class ResourceManager {
    public model = new ResourceModel();
    public linkModel = new ResourceLinkModel();

    public addResource(url: string, scriptId: number): Promise<boolean> {
        return new Promise(async resolve => {
            this.getResource(url).then(async result => {
                if (!result) {
                    let resource = await this.loadByUrl(url);
                    if (!resource) {
                        return;
                    }
                    resource.createtime = new Date().getTime();
                    resource.updatetime = new Date().getTime();
                    await App.Cache.set('resource:' + url, resource);
                    if (await this.model.save(resource)) {
                        App.Log.Info("resource", url, "add");
                    }
                }
            });

            let link = await this.linkModel.findOne({ url: url, scriptId: scriptId });
            if (link) {
                return resolve(true);
            }
            let ret = await this.linkModel.save({ id: 0, url: url, scriptId: scriptId, createtime: new Date().getTime() });
            if (ret) {
                return resolve(true);
            }
            return resolve(false);
        });
    }

    public getResource(url: string): Promise<Resource | undefined> {
        return new Promise(async resolve => {
            let resource: Resource | undefined = await App.Cache.getOrSet('resource:' + url, () => {
                return new Promise(async resolve => {
                    let resource = await this.model.findOne({ url: url });
                    resolve(resource);
                });
            });
            if (resource) {
                let newresource: Resource | undefined;
                if ((resource.updatetime || 0) < new Date().getTime() - SystemConfig.check_update_cycle * 1000) {
                    newresource = await this.loadByUrl(url);
                    if (newresource) {
                        newresource.id = resource.id;
                        resource = newresource;
                        resource.updatetime = new Date().getTime();
                        if (!await this.model.save(resource)) {
                            return resolve(undefined);
                        }
                        App.Log.Info("resource", url, "update");
                        await App.Cache.set('resource:' + url, resource);
                    }
                }
                return resolve(resource);
            }
            return resolve(undefined);
        });
    }

    public deleteResource(url: string, scriptId: number): Promise<boolean> {
        return new Promise(async resolve => {
            let link = await this.linkModel.findOne({ url: url, scriptId: scriptId });
            if (!link) {
                return resolve(false);
            }
            await this.linkModel.delete(link.id);
            let list = await this.linkModel.list(where => {
                return where.where({ url: url });
            });
            if (!list.length) {
                this.model.delete({ url: url });
            }
            return resolve(true);
        });
    }

    public loadByUrl(url: string): Promise<Resource | undefined> {
        return new Promise(async resolve => {
            axios.get(url).then(async response => {
                if (response.status != 200) {
                    return resolve(undefined);
                }
                let text = response.data;
                let resource: Resource = {
                    id: 0,
                    url: url, content: text,
                    hash: {
                        md5: crypto.HmacMD5(text, "").toString(),
                        sha1: crypto.HmacSHA1(text, "").toString(),
                        sha256: crypto.HmacSHA256(text, "").toString(),
                        sha384: crypto.HmacSHA384(text, "").toString(),
                        sha512: crypto.HmacSHA512(text, "").toString(),
                    }
                };
                App.Log.Info("resource", url, "load");
                return resolve(resource);
            }).catch(() => {
                return resolve(undefined);
            });
        });
    }

}