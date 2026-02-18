export const isValidDNRUrlFilter = (text: string) => {
  // https://developer.chrome.com/docs/extensions/reference/api/declarativeNetRequest?hl=en#property-RuleCondition-urlFilter

  const domainNameAnchor = text.startsWith("||");

  const leftAnchor = !domainNameAnchor && text.startsWith("|");

  const rightAnchor = text.endsWith("|");

  try {
    let s = text;

    if (domainNameAnchor) s = s.slice(2);
    if (leftAnchor) s = s.slice(1);
    if (rightAnchor) s = s.slice(0, -1);

    const t = s.replace(/\*/g, "").replace(/^/g, "_");

    // eslint-disable-next-line no-control-regex
    if (/[^\x00-\xFF]/.test(t)) return false;

    new URL(t);

    return true;
  } catch {
    return false;
  }
};

export const convertDomainToDNRUrlFilter = (text: string) => {
  // will match its domain and subdomain
  let ret;
  text = text.toLowerCase();
  try {
    if (text.startsWith("http") && /^http[s*]?:\/\//.test(text)) {
      const u = new URL(`${text.replace("http*://", "http-wildcard://")}`);
      ret = `|${u.origin.replace("http-wildcard://", "http://")}`;
    } else {
      const u = new URL(`https://${text}/`);
      ret = `||${u.hostname}`;
    }
  } catch {
    throw new Error("invalid domain");
  }
  return ret;
};
