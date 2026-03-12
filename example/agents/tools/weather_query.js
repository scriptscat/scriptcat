// ==CATTool==
// @name         weather_query
// @description  查询指定城市的实时天气信息，包括温度、天气状况和湿度
// @param        city string [required] 城市名称，如 北京、上海、Tokyo
// @param        unit string[celsius,fahrenheit] 温度单位，默认 celsius
// @grant        GM_xmlhttpRequest
// ==/CATTool==

// 演示：使用 GM_xmlhttpRequest 调用外部 API
// 这里使用 wttr.in 的免费天气 API 作为示例
const city = encodeURIComponent(args.city);
const unit = args.unit === "fahrenheit" ? "u" : "m";

const response = await new Promise((resolve, reject) => {
  GM_xmlhttpRequest({
    method: "GET",
    url: `https://wttr.in/${city}?format=j1&${unit}`,
    onload: (res) => {
      if (res.status === 200) {
        resolve(JSON.parse(res.responseText));
      } else {
        reject(new Error(`HTTP ${res.status}: ${res.statusText}`));
      }
    },
    onerror: (err) => reject(new Error("请求失败: " + err.error)),
  });
});

const current = response.current_condition[0];
return {
  city: args.city,
  temperature: args.unit === "fahrenheit" ? current.temp_F + "°F" : current.temp_C + "°C",
  feelsLike: args.unit === "fahrenheit" ? current.FeelsLikeF + "°F" : current.FeelsLikeC + "°C",
  condition: current.weatherDesc[0].value,
  humidity: current.humidity + "%",
  windSpeed: current.windspeedKmph + " km/h",
};
