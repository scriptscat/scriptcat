import { Resource } from "@App/model/do/resource";
import { ResourceLinkModel, ResourceModel } from "@App/model/resource";
import { blobToBase64 } from "@App/pkg/utils";
import axios from "axios";
import crypto from "crypto-js";
import { App } from "./app";

// @resource @require 等资源管理
export class ResourceManager {
    public model = new ResourceModel();
    public linkModel = new ResourceLinkModel();

    public addResource(url: string, scriptId: number): Promise<Resource | undefined> {
        return new Promise(async resolve => {
            let u = this.parseUrl(url);
            let result = await this.getResource(u.url);
            if (!result) {
                let resource = await this.loadByUrl(u.url);
                if (!resource) {
                    return resolve(undefined);
                }
                resource.createtime = new Date().getTime();
                resource.updatetime = new Date().getTime();
                await App.Cache.set('resource:' + u.url, resource);
                if (await this.model.save(resource)) {
                    result = resource;
                    App.Log.Info("resource", u.url, "add");
                }
            }

            let link = await this.linkModel.findOne({ url: u.url, scriptId: scriptId });
            if (link) {
                return resolve(result);
            }
            let ret = await this.linkModel.save({ id: 0, url: u.url, scriptId: scriptId, createtime: new Date().getTime() });
            if (ret) {
                return resolve(undefined);
            }
            return resolve(result);
        });
    }

    public getResource(url: string): Promise<Resource | undefined> {
        return new Promise(async resolve => {
            let u = this.parseUrl(url);
            let resource = await this.model.findOne({ url: u.url });
            if (resource) {
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
            axios.get(u.url, {
                responseType: "blob"
            }).then(async response => {
                if (response.status != 200) {
                    return resolve(undefined);
                }
                let resource: Resource = {
                    id: 0,
                    url: u.url, content: '',
                    contentType: (response.headers['content-type'] || '').split(';')[0],
                    hash: {
                        md5: crypto.MD5(response.data).toString(),
                        sha1: crypto.SHA1(response.data).toString(),
                        sha256: crypto.SHA256(response.data).toString(),
                        sha384: crypto.SHA384(response.data).toString(),
                        sha512: crypto.SHA512(response.data).toString(),
                    }
                };
                resource.content = await (<Blob>response.data).text();
                resource.base64 = await blobToBase64(<Blob>response.data) || '';
                App.Log.Info("resource", u.url, "load");
                return resolve(resource);
            }).catch((e) => {
                console.log(url, 'error', e);
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

    public parseContent(url: string, content: string, contentType: string): Resource {
        let u = this.parseUrl(url);
        let resource: Resource = {
            id: 0,
            url: u.url, content: content,
            contentType: contentType,
            hash: {
                md5: crypto.MD5(content).toString(),
                sha1: crypto.SHA1(content).toString(),
                sha256: crypto.SHA256(content).toString(),
                sha384: crypto.SHA384(content).toString(),
                sha512: crypto.SHA512(content).toString(),
            }
        };
        resource.base64 = btoa(encodeURI(content));
        return resource;
    }
}