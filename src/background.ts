import ConnectCenter from "./app/connect/center";
import migrate from "./app/migrate";
import ScriptManager from "./app/script/manager";
// 数据库初始化
migrate();
// 通讯中心
const center = new ConnectCenter();
center.listen();
// 脚本后台处理器
const script = new ScriptManager(center);

script.start();
