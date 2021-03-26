
export class UrlMatch<T> {

    protected cache = new Map<string, T[]>();
    protected reverseCache = new Map<T, string[]>();
    protected rule = new Map<string, T[]>();

    protected parseURL(url: string): Url | undefined {
        let match = /^(.+?):\/\/(.*?)((\/.*?)(\?.*?|)|)$/.exec(url);
        if (match) {
            return {
                scheme: match[1],
                host: match[2],
                path: match[4] || "/",
                search: match[5],
            };
        }
        return undefined;
    }

    protected compileRe(url: string): string {
        let u = this.parseURL(url);
        if (!u) {
            return '';
        }
        switch (u.scheme) {
            case '*':
                u.scheme = '.+?';
                break;
            case 'http*':
                u.scheme = 'http[s]';
                break;
        }
        u.host = u.host.replace('*', '.+?');
        let re: string = `^${u.scheme}://${u.host}`;
        if (u.path == '/') {
            re += '[/]?';
        } else {
            re += u.path.replace(/\*/g, '.*?');
        }
        return re.replace(/\//g, "\/") + '$';
    }

    public add(url: string, val: T) {
        let re = this.compileRe(url);
        if (!re) {
            return;
        }
        let rule = this.rule.get(re);
        if (!rule) {
            rule = [];
            this.rule.set(re, rule);
        }
        rule.push(val);
        this.delCache(url, val);
    }

    public match(url: string): T[] {
        let ret = this.cache.get(url);
        if (ret) {
            return ret;
        }
        ret = [];
        this.rule.forEach((val, key) => {
            let re = new RegExp(key);
            if (re.test(url)) {
                ret!.push(...val);
                val.forEach(val => {
                    let list = this.reverseCache.get(val);
                    if (!list) {
                        list = [];
                    }
                    list.push(url);
                    this.reverseCache.set(val, list);
                });
            }
        });
        this.cache.set(url, ret);
        return ret;
    }

    public del(url: string, delVal: T) {
        let re = this.compileRe(url);
        if (!re) {
            return;
        }
        let rule = this.rule.get(re);
        if (rule) {
            let tmp: T[] = [];
            rule.forEach(val => {
                if (val != delVal) {
                    tmp.push(val);
                }
            })
            if (tmp) {
                this.rule.set(re, tmp);
            } else {
                this.rule.delete(re);
            }
        }
        this.delCache(url, delVal);
    }

    protected delCache(url: string, delVal: T) {
        let keys = this.reverseCache.get(delVal);
        keys?.forEach(key => {
            let cache = this.cache.get(key);
            if (cache) {
                this.cache.delete(key);
            }
        });
        this.reverseCache.delete(delVal);
        this.cache.forEach((val, key) => {
            if (!val.length) {
                this.cache.delete(key);
            }
        })
    }

}

export interface Url {
    scheme: string;
    host: string;
    path: string;
    search: string;
}

