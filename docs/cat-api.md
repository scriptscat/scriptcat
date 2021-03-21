## CatApi 文档

### 说明

本扩展特有的API将会以 CAT_ 开头进行定义,如有同步类型的API,也会使用 CAT.* 的方式进行定义.对于某些API为了使用方便会提供GM的别名.



### 定义


#### CAT_setProxy
> 设置代理,请注意本功能会与Proxy SwitchyOmega类型的扩展冲突.可以多个脚本使用代理,不会产生冲突.(例如一个脚本提供Google访问,一个脚本提供推特访问)

请先了解[PAC](https://developer.mozilla.org/zh-CN/docs/Web/HTTP/Proxy_servers_and_tunneling/Proxy_Auto-Configuration_PAC_file)和[PAC中Chromium 完整网址限制](https://github.com/FelisCatus/SwitchyOmega/wiki/Chromium-%E5%AE%8C%E6%95%B4%E7%BD%91%E5%9D%80%E9%99%90%E5%88%B6)

```typescript
declare function CAT_setProxy(rule: CAT_Types.ProxyRule[] | string): void;

declare namespace CAT_Types {
    interface ProxyRule {
        proxyServer: ProxyServer
        matchUrl: string[]
    }
    type ProxyScheme = "http" | "https" | "quic" | "socks4" | "socks5";
    interface ProxyServer {
        scheme?: ProxyScheme
        host: string
        port?: number
    }
}
    
```



#### CAT_clearProxy

> 清理代理

```typescript
declare function CAT_clearProxy(): void;
```



