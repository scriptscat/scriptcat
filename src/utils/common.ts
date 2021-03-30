export function sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

export function dealScript(url: string, source: string): string {
    source = "//# sourceURL=" + url + "\n" + source;
    return dealSymbol(source);
}

export function dealSymbol(source: string): string {
    source = source.replace(/("|\\)/g, "\\$1");
    source = source.replace(/(\r\n|\n)/g, "\\n");
    return source;
}


/**
 * get请求
 * @param {*} url
 */
export function get(url: string, success: Function) {
    let xmlhttp = createRequest();
    xmlhttp.open("GET", url, true);
    xmlhttp.onreadystatechange = function () {
        if (this.readyState == 4) {
            if (this.status == 200) {
                success && success(this.responseText, (<any>this).resource);
            } else {
                (<any>xmlhttp).errorCallback && (<any>xmlhttp).errorCallback(this);
            }
        }
    };
    xmlhttp.send();
    return xmlhttp;
}

/**
 * post请求
 * @param {*} url
 * @param {*} data
 * @param {*} json
 */
export function post(url: string, data: any, json = true, success: Function) {
    let xmlhttp = createRequest();
    xmlhttp.open("POST", url, true);
    if (json) {
        xmlhttp.setRequestHeader("Content-Type", "application/json");
    } else {
        xmlhttp.setRequestHeader("Content-Type", "application/x-www-form-urlencoded");
    }
    xmlhttp.onreadystatechange = function () {
        if (this.readyState == 4) {
            if (this.status == 200) {
                success && success(this.responseText);
            } else {
                (<any>xmlhttp).errorCallback && (<any>xmlhttp).errorCallback(this);
            }
        }
    };

    xmlhttp.send(data);
    return xmlhttp;
}

/**
 * 创建http请求
 */
function createRequest(): XMLHttpRequest {
    let xmlhttp: XMLHttpRequest;
    if (window.XMLHttpRequest) {
        xmlhttp = new XMLHttpRequest();
    } else {
        xmlhttp = new ActiveXObject("Microsoft.XMLHTTP");
    }
    (<any>xmlhttp).error = function (callback: Function) {
        (<any>xmlhttp).errorCallback = callback;
        return xmlhttp;
    };
    xmlhttp.withCredentials = true;
    return xmlhttp;
}
