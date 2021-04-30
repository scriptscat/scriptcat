

export function addStyle(css: string): HTMLElement {
    let dom = document.createElement('style');
    dom.innerHTML = css;
    document.documentElement.appendChild(dom);
    return dom;
}
