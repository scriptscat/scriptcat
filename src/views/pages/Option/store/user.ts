import { Server } from "@App/apps/config";
import { get } from "@App/pkg/utils";
import {
    Action,
    Module,
    Mutation,
    MutationAction,
    VuexModule,
    getModule,
} from "vuex-module-decorators";

import store from "./index";

@Module({
    name: "user",
    store,
    dynamic: true,
})
class UserModule extends VuexModule {

    userinfo = { islogin: false, username: '未登录' };

    @Mutation
    checkUserinfo() {
        get(Server + "api/v1/user", (resp) => {
            let json = JSON.parse(resp);
            if (json.code == 0) {
                json.data.islogin = true;
                this.userinfo = json.data;
            }
        });
    }

    @Mutation
    setUserinfo(userinfo: any) {
        this.userinfo = userinfo;
    }

    @Mutation
    logout() {
        this.userinfo = { islogin: false, username: '未登录' };
    }

}

const userModule = getModule(UserModule);
export { userModule };
