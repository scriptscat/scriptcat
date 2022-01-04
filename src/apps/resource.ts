import { Resource, ResourceHash } from '@App/model/do/resource';
import { ResourceLinkModel, ResourceModel } from '@App/model/resource';
import { blobToBase64, strToBase64 } from '@App/pkg/utils/utils';
import axios from 'axios';
import crypto from 'crypto-js';
import { App } from './app';

// @resource @require 等资源管理
export class ResourceManager {
    public model = new ResourceModel();
    public linkModel = new ResourceLinkModel();

    public addResource(url: string, scriptId: number): Promise<Resource | undefined> {
        return new Promise(async resolve => {
            const u = this.parseUrl(url);
            let result = await this.getResource(u.url);
            if (!result) {
                const resource = await this.loadByUrl(u.url);
                if (!resource) {
                    return resolve(undefined);
                }
                resource.createtime = new Date().getTime();
                resource.updatetime = new Date().getTime();
                await App.Cache.set('resource:' + u.url, resource);
                if (await this.model.save(resource)) {
                    result = resource;
                    App.Log.Info('resource', u.url, 'add');
                }
            }

            const link = await this.linkModel.findOne({ url: u.url, scriptId: scriptId });
            if (link) {
                return resolve(result);
            }
            const ret = await this.linkModel.save({ id: 0, url: u.url, scriptId: scriptId, createtime: new Date().getTime() });
            if (ret) {
                return resolve(undefined);
            }
            return resolve(result);
        });
    }

    public getResource(url: string): Promise<Resource | undefined> {
        return new Promise(async resolve => {
            const u = this.parseUrl(url);
            const resource = await this.model.findOne({ url: u.url });
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
            const u = this.parseUrl(url);
            const link = await this.linkModel.findOne({ url: u.url, scriptId: scriptId });
            if (!link) {
                return resolve(false);
            }
            await this.linkModel.delete(link.id);
            const list = await this.linkModel.list(where => {
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
        return new Promise(resolve => {
            const u = this.parseUrl(url);
            axios.get(u.url, {
                responseType: 'blob'
            }).then(response => {
                const handler = async () => {
                    if (response.status != 200) {
                        return resolve(undefined);
                    }
                    const resource: Resource = {
                        id: 0,
                        url: u.url, content: '',
                        contentType: (<string>((<AnyMap>response.headers)['content-type']) || '').split(';')[0],
                        hash: await this.calculateHash(<Blob>response.data),
                        base64: '',
                    };
                    resource.content = await (<Blob>response.data).text();
                    resource.base64 = await blobToBase64(<Blob>response.data) || '';
                    App.Log.Info('resource', u.url, 'load');
                    return resolve(resource);
                }
                void handler();
            }).catch((e) => {
                console.log(url, 'error', e);
                return resolve(undefined);
            });
        });
    }

    public calculateHash(blob: Blob): Promise<ResourceHash> {
        return new Promise(resolve => {
            const reader = new FileReader();
            reader.readAsBinaryString(blob);
            reader.onloadend = function () {
                if (!reader.result) {
                    return resolve({ md5: '', sha1: '', sha256: '', sha384: '', sha512: '' });
                }
                resolve({
                    md5: crypto.MD5(<string>reader.result).toString(),
                    sha1: crypto.SHA1(<string>reader.result).toString(),
                    sha256: crypto.SHA256(<string>reader.result).toString(),
                    sha384: crypto.SHA384(<string>reader.result).toString(),
                    sha512: crypto.SHA512(<string>reader.result).toString(),
                });
            };
        });
    }

    public parseUrl(url: string): { url: string, hash?: { [key: string]: string } } {
        const urls = url.split('#');
        if (urls.length < 2) {
            return { url: urls[0], hash: undefined };
        }
        const hashs = urls[1].split(/[,;]/);
        const hash: { [key: string]: string } = {};
        hashs.forEach(val => {
            const kv = val.split('=');
            if (kv.length < 2) {
                return
            }
            hash[kv[0]] = kv[1].toLocaleLowerCase();
        });
        return { url: urls[0], hash: hash };
    }

    public parseContent(url: string, content: string, contentType: string): Resource {
        const u = this.parseUrl(url);
        const resource: Resource = {
            id: 0,
            url: u.url, content: content,
            contentType: contentType,
            hash: {
                md5: crypto.MD5(content).toString(),
                sha1: crypto.SHA1(content).toString(),
                sha256: crypto.SHA256(content).toString(),
                sha384: crypto.SHA384(content).toString(),
                sha512: crypto.SHA512(content).toString(),
            },
            base64: '',
        };
        resource.base64 = 'data:' + contentType + ';base64,' + strToBase64(content);
        return resource;
    }
}