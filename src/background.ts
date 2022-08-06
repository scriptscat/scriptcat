import ConnectCenter from "./app/connect/center";
import migrate from "./app/migrate";
import ScriptManager from "./app/script/manager";
// 数据库初始化
migrate();
// 通讯中心
ConnectCenter.getInstance().listen();
// 脚本后台处理器
ScriptManager.getInstance().start();
