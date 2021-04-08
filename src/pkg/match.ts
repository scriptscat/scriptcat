
export class UrlMatch<T> {

    protected cache = new Map<string, T[]>();
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
        if (u.search) {
            re += u.search.replace('*', '.+?');
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
        this.delCache(val);
    }

    public has(val: T): boolean {
        let arr = Array.from(this.rule.keys());
        let key: string | undefined = '';
        while (key = arr.pop()) {
            let rule = this.rule.get(key);
            if (!rule) {
                continue;
            }
            for (let i = 0; i < rule.length; i++) {
                if (this.getId(rule[i]) == this.getId(val)) {
                    return true;
                }
            }
        }
        return false;
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
            }
        });
        this.cache.set(url, ret);
        return ret;
    }

    protected getId(val: T): string {
        if (typeof val == 'object') {
            return (<any>val).id;
        }
        return <string><unknown>val;
    }

    public del(url: string, delVal: T) {
        let re = this.compileRe(url);
        if (!re) {
            return;
        }
        let rule = this.rule.get(re);
        let id = this.getId(delVal);
        if (rule) {
            let tmp: T[] = [];
            rule.forEach(val => {
                if (this.getId(val) != id) {
                    tmp.push(val);
                }
            })
            if (tmp) {
                this.rule.set(re, tmp);
            } else {
                this.rule.delete(re);
            }
        }
        this.delCache(delVal);
    }

    protected delCache(delVal: T) {
        this.cache.clear();
    }

}

export interface Url {
    scheme: string;
    host: string;
    path: string;
    search: string;
}

