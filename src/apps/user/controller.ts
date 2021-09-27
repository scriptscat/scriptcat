import { UserLogin, UserLogout } from "../msg-center/event";
import { MsgCenter } from "../msg-center/msg-center";

export class UserController {

    public login(userinfo: any): Promise<any> {
        return new Promise(resolve => {
            MsgCenter.sendMessage(UserLogin, userinfo, resp => {
                resolve(1);
            });
        })
    }

    public logout(): Promise<any> {
        return new Promise(resolve => {
            MsgCenter.sendMessage(UserLogout, undefined, resp => {
                resolve(1);
            });
        })
    }
}