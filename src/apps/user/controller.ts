import { get } from '@App/pkg/utils/utils';
import { Server } from '../config';
import { TriggerSync, UserLogin, UserLogout } from '../msg-center/event';
import { MsgCenter } from '../msg-center/msg-center';

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
            get(Server + 'api/v1/account/logout');
            MsgCenter.sendMessage(UserLogout, undefined, resp => {
                resolve(1);
            });
        })
    }

    public sync(): Promise<string> {
        return new Promise(resolve => {
            MsgCenter.sendMessage(TriggerSync, undefined, resp => {
                resolve(resp);
            });
        })

    }
}