import Runtime from "./runtime";
import WebRequest from "./web_reqeuest";

const mockChrome = {
  runtime: new Runtime(),
  webRequest: new WebRequest(),
};
// @ts-ignore
global.chrome = mockChrome;
