import Runtime from "./runtime";
import MockTab from "./tab";
import WebRequest from "./web_reqeuest";

const chromeMock = {
  tabs: new MockTab(),
  runtime: new Runtime(),
  webRequest: new WebRequest(),
};
// @ts-ignore
global.chrome = chromeMock;

export default chromeMock;
