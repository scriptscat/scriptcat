// 把簡單的時間格式function以pure javascript做出來

// export function dayFormatCurrent() {
//   // return dayjs(new Date()).format("YYYY-MM-DD HH:mm:ss")
//   return dayFormat(new Date(), "YYYY-MM-DD HH:mm:ss");
// }

// export function formatTime(time: Date) {
//   return dayFormat(time, "YYYY-MM-DD HH:mm:ss");
// }

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
        return m < 10 ? `0${m}` : m.toString();
      }
      case "DD": {
        const d = date.getDate();
        return d < 10 ? `0${d}` : d.toString();
      }
      case "HH": {
        const h = date.getHours();
        return h < 10 ? `0${h}` : h.toString();
      }
      case "mm": {
        const min = date.getMinutes();
        return min < 10 ? `0${min}` : min.toString();
      }
      case "ss": {
        const s = date.getSeconds();
        return s < 10 ? `0${s}` : s.toString();
      }
      default:
    }
    return token;
  });
}

export function formatUnixTime(time: number) {
  // return dayjs.unix(time).format("YYYY-MM-DD HH:mm:ss");
  const date = new Date(time * 1000);
  return dayFormat(date, "YYYY-MM-DD HH:mm:ss");
}
