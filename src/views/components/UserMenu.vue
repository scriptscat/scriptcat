<template>
  <v-menu bottom min-width="200px" rounded offset-y>
    <template v-slot:activator="{ on }">
      <v-btn icon x-large v-on="on">
        <v-avatar dark size="36">
          <v-icon dark v-if="!user.avatar">
            {{ icons.mdiAccountCircle }}
          </v-icon>
          <img v-else :src="server + user.avatar" :alt="user.username" />
        </v-avatar>
      </v-btn>
    </template>
    <v-card>
      <v-list-item-content class="justify-center">
        <div class="mx-auto text-center">
          <v-avatar color="#1296db" dark>
            <v-icon dark v-if="!user.avatar">{{
              icons.mdiAccountCircle
            }}</v-icon>
            <img v-else :src="server + user.avatar" :alt="user.username" />
          </v-avatar>
          <h3 style="margin-top: 10px">{{ user.username }}</h3>
          <div v-if="user.islogin">
            <v-divider class="my-3"></v-divider>
            <v-btn depressed rounded text @click="userInfo">个人设置</v-btn>
            <v-divider class="my-3"></v-divider>
            <v-btn depressed rounded text @click="logout">注销</v-btn>
          </div>
          <div v-else>
            <v-divider class="my-3"></v-divider>
            <v-btn depressed rounded text @click="login">登录</v-btn>
          </div>
        </div>
      </v-list-item-content>
    </v-card>
  </v-menu>
</template>

<script lang="ts">
import { Server } from "@App/apps/config";
import { Vue, Component, Watch } from "vue-property-decorator";
import { userModule } from "@App/views/pages/Option/store/user";
import { UserController } from "@App/apps/user/controller";
import { mdiAccountCircle } from "@mdi/js";

@Component({})
export default class Snackbar extends Vue {
  icons = { mdiAccountCircle };
  user = userModule.userinfo;
  server = Server.substring(0, Server.length - 1);

  userController = new UserController();

  @Watch("$store.state.user.userinfo")
  getUserInfo() {
    this.user = this.$store.state.user.userinfo;
    if (this.user.islogin) {
      this.userController.login(this.user);
    } else {
      this.userController.logout();
    }
  }

  login() {
    let loginWindow = window.open(Server + "user/login?redirect=scriptcat");
    if (!loginWindow) {
      return;
    }
    let t = setInterval(() => {
      try {
        if (loginWindow!.closed) {
          clearInterval(t);
          //检测登录
          userModule.login();
        }
      } catch (e) {
        clearInterval(t);
        //检测登录
        userModule.login();
      }
    }, 1000);
  }

  logout() {
    userModule.logout();
  }

  userInfo() {
    window.open(Server + "account/settings");
  }
}
</script>