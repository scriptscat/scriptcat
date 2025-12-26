import Cookies from "./cookies";
import Downloads from "./downloads";
import Notifications from "./notifications";
import Runtime from "./runtime";
import MockTab from "./tab";
import WebRequest from "./web_reqeuest";
import Storage from "./storage";
import I18n from "./i18n";
import DeclarativeNetRequest from "./declarativ_net_request";
import Permissions from "./permissions";
import Extension from "./extension";
import MockUserScripts from "./user_scripts";
import Action from "./action";

const chromeMock = {
  tabs: new MockTab(),
  runtime: new Runtime(),
  webRequest: new WebRequest(),
  notifications: new Notifications(),
  downloads: new Downloads(),
  cookies: new Cookies(),
  storage: new Storage(),
  i18n: new I18n(),
  declarativeNetRequest: new DeclarativeNetRequest(),
  permissions: new Permissions(),
  extension: new Extension(),
  userScripts: new MockUserScripts(),
  action: new Action(),
  init() {},
};

export default chromeMock;
