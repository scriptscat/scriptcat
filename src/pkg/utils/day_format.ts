// 把简单的时间格式function以pure javascript做出来

export function formatUnixTime(time: number) {
  const date = new Date(time * 1000);
  return dayFormat(date, "YYYY-MM-DD HH:mm:ss");
}

const formatRe = /YYYY|MM|DD|HH|mm|ss/g;

export function dayFormat(date = new Date(), fmt = "YYYY-MM-DD HH:mm:ss"): string {
  return fmt.replace(formatRe, (token) => {
    switch (token) {
      case "YYYY": {
        const y = date.getFullYear();
        return y.toString();
      }
      case "MM": {
        const m = date.getMonth() + 1;
        return m < 10 ? "0" + m : m.toString();
      }
      case "DD": {
        const d = date.getDate();
        return d < 10 ? "0" + d : d.toString();
      }
      case "HH": {
        const h = date.getHours();
        return h < 10 ? "0" + h : h.toString();
      }
      case "mm": {
        const min = date.getMinutes();
        return min < 10 ? "0" + min : min.toString();
      }
      case "ss": {
        const s = date.getSeconds();
        return s < 10 ? "0" + s : s.toString();
      }
    }
    return token;
  });
}
