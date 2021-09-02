<!--
 * @Author: Przeblysk
 * @Date: 2021-09-01 20:35:42
 * @LastEditTime: 2021-09-04 15:58:47
 * @LastEditors: Przeblysk
 * @Description: 
 * @FilePath: /scriptcat/src/views/pages/Popup/index.vue
 * 
-->
<template>
  <div class="wrapper">
    <div class="top">
      <h3 class="title">ScriptCat</h3>
      <div class="top-rigth">
        <q-popover
          title="通知"
          tagName="span"
          trigger="hover"
          placement="top-start"
          icon="q-icon-bell"
          iconColor="var(--gradient-secondary)"
          transition="fade-in-linear"
          :openDelay="10"
          :closeDelay="10"
          min-width="100%"
          appendToBody
        >
          <span slot="reference">
            <i class="far" :class="[notice != oldNotice ? 'fa-comment' : 'fa-comment-dots']"></i>
          </span>
          <span v-html="notice"></span>
        </q-popover>
      </div>
    </div>

    <!-- <q-popover
      title="What is Lorem Ipsum?"
      tagName="span"
      trigger="click"
      placement="top-start"
      icon="q-icon-question"
      iconColor="var(--gradient-secondary)"
      transition="fade-in-linear"
      :openDelay="10"
      :closeDelay="10"
      appendToBody
    >
      <button class="btn btn-icon-only btn-pill btn-primary">
        <span>
          <i class="far fa-comment"></i>
        </span>
      </button>
    </q-popover>-->
    <ul class="entries">
      <li>
        <a class="entry" href="/options.html" target="_blank">主页</a>
      </li>
      <li>
        <a class="entry" href="/options.html#/?target=initial" target="_blank">新增脚本</a>
      </li>
      <li>
        <a class="entry" href="https://scriptcat.org" target="_blank">获取脚本</a>
      </li>
      <li>
        <a class="entry" href="https://github.com/scriptscat/scriptcat/issues" target="_blank">bug反馈</a>
      </li>
      <li>
        <a class="entry" href="https://docs.scriptcat.org" target="_blank">项目文档</a>
      </li>
      <li>
        <a class="entry" href="https://github.com/scriptscat/scriptcat" target="_blank">Github</a>
      </li>
    </ul>
    <div class="tabs">
      <div class="tabs__bar">
        <ul class="tb__list">
          <li class="tb__item" :class="{ 'is-active': scriptTab === 0 }" @click="tabClick(0)">
            <div class="tb__item-cont" :class="{ 'is-active': scriptTab === 0 }">当前页运行脚本</div>
          </li>
          <li class="tb__item" :class="{ 'is-active': scriptTab === 1 }" @click="tabClick(1)">
            <div class="tb__item-cont" :class="{ 'is-active': scriptTab === 1 }">后台脚本</div>
          </li>
        </ul>
      </div>
      <div class="tabs__cont">
        <div class="tb__cont-list" v-if="scriptTab === 0">
          <div class="tb__cont-item" v-if="scripts.length === 0">
            <span class="tb__cont-item__tip">当前网站还没有被添加脚本呢，快去添加脚本吧:)</span>
          </div>
          <div class="tb__cont-item" v-for="script in scripts" :key="script.id">
            <q-checkbox
              :value="script.status === 1"
              label
              rootTag="label"
              @change="changScriptStaus(script)"
            />
            <span class="tb__cont-item__name">{{ script.name }}</span>
            <button
              class="btn btn-icon-only btn-pill btn-primary"
              @click="navigateToEditor(script)"
            >
              <span>
                <i class="fas fa-edit"></i>
              </span>
            </button>
            <q-popover
              title="自定义功能"
              tagName="span"
              trigger="click"
              placement="top-start"
              icon="q-icon-menu"
              iconColor="var(--gradient-secondary)"
              transition="fade-in-linear"
              :openDelay="10"
              :closeDelay="10"
              min-width="100%"
              appendToBody
              v-if="menu && menu[script.id]"
            >
              <button class="btn btn-icon-only btn-pill btn-primary" slot="reference">
                <span>
                  <i class="fas fa-wrench"></i>
                </span>
              </button>
              <div class="menu-list">
                <div class="menu-item" v-for="(item, index) in menu[script.id]" :key="index">
                  <q-button
                    type="default"
                    theme="primary"
                    size="medium"
                    @click="menuClick(item)"
                  >{{ item.name }}</q-button>
                </div>
              </div>
            </q-popover>
            <!--  <button
              class="btn btn-icon-only btn-pill btn-primary"
              @click="scriptController.exec(script.id, false)"
            >
              <span>
                <i class="fas fa-play"></i>
              </span>
            </button>-->
          </div>
        </div>
        <div class="tb__cont-list" v-else>
          <div class="tb__cont-item" v-if="bgScripts.length === 0">
            <span class="tb__cont-item__tip">您还没有添加任何后台脚本呢，快去添加脚本吧:)</span>
          </div>
          <div class="tb__cont-item" v-for="script in bgScripts" :key="script.id">
            <q-checkbox
              :value="script.status === 1"
              label
              rootTag="label"
              @change="changScriptStaus(script)"
            />
            <span class="tb__cont-item__name">{{ script.name }}</span>
            <button
              class="btn btn-icon-only btn-pill btn-primary"
              @click="navigateToEditor(script)"
            >
              <span>
                <i class="fas fa-edit"></i>
              </span>
            </button>
            <button class="btn btn-icon-only btn-pill btn-primary" @click="execOrStop(script)">
              <span>
                <i class="fas" :class="[script.runStatus === 'complete' ? 'fa-play' : 'fa-stop']"></i>
              </span>
            </button>
            <q-popover
              title="自定义功能"
              tagName="span"
              trigger="click"
              placement="top-start"
              icon="q-icon-menu"
              iconColor="var(--gradient-secondary)"
              transition="fade-in-linear"
              :openDelay="10"
              :closeDelay="10"
              min-width="100%"
              appendToBody
              v-if="bgMenu && bgMenu[script.id]"
            >
              <button class="btn btn-icon-only btn-pill btn-primary" slot="reference">
                <span>
                  <i class="fas fa-wrench"></i>
                </span>
              </button>
              <div class="menu-list">
                <div class="menu-item" v-for="(item, index) in bgMenu[script.id]" :key="index">
                  <q-button
                    type="default"
                    theme="primary"
                    size="medium"
                    @click="menuClick(item)"
                  >{{ item.name }}</q-button>
                </div>
              </div>
            </q-popover>
          </div>
        </div>
      </div>
    </div>

    <footer>
      <span>当前版本：{{ version }} {{ isdebug ? "debug" : "" }}</span>
    </footer>
  </div>
</template>

<script lang="ts">
import { Vue, Component } from "vue-property-decorator";
import { Tab, TabPane } from "@App/views/components/Tab";
import {
  Script,
  SCRIPT_TYPE_CRONTAB,
  SCRIPT_TYPE_BACKGROUND,
  SCRIPT_STATUS_DISABLE,
  SCRIPT_STATUS_ENABLE,
  SCRIPT_RUN_STATUS_RUNNING,
  SCRIPT_RUN_STATUS_COMPLETE,
} from "@App/model/do/script";
import { MsgCenter } from "@App/apps/msg-center/msg-center";
import { RequestTabRunScript, TabMenuClick, } from "@App/apps/msg-center/event";
import { ScriptController } from "@App/apps/script/controller";
import { ExtVersion } from "@App/apps/config";
import ScriptList from "./ScriptList.vue";
@Component({
  components: {
    Tab,
    TabPane,
    ScriptList,
  },
})
export default class Popup extends Vue {
  scriptController: ScriptController = new ScriptController();
  protected scripts: Array<Script> = [];
  protected bgScripts: Array<Script> = [];

  menu: any = {};
  bgMenu: any = {};

  items = [{}];

  tabs = null;

  version = ExtVersion;
  isdebug = process.env.NODE_ENV == "development";

  panel = [0];

  notice = "";
  oldNotice = "";
  scriptTab = 0;

  created() {
    chrome.storage.local.get(["notice", "oldNotice"], (items) => {
      this.notice = items["notice"];
      this.oldNotice = items["oldNotice"];
    });
    chrome.tabs.query(
      { active: true, lastFocusedWindow: true },
      async (tabs) => {
        MsgCenter.sendMessage(
          RequestTabRunScript,
          {
            tabId: tabs[0].id,
            url: tabs[0].url,
          },
          (val) => {
            this.scripts = val.run;
            this.menu = val.runMenu || {};
            this.bgMenu = val.bgMenu || {};
            console.log(this.menu);

            // 将有菜单的后台脚本,放到运行脚本中
            this.scriptController
              .scriptList((where) => {
                return where
                  .where("type")
                  .anyOf([SCRIPT_TYPE_BACKGROUND, SCRIPT_TYPE_CRONTAB]);
              })
              .then((result) => {
                this.bgScripts = result;
                let map = new Map();
                result.forEach((val) => {
                  map.set(val.id, val);
                });
                for (const id in this.bgMenu) {
                  this.scripts.push(map.get(parseInt(id)));
                  this.menu[id] = this.bgMenu[id];
                }
              });
          }
        );
      }
    );
  }

  /**
   * 跳转到编辑页
   */
  navigateToEditor(script: Script) {
    const targetUrl = chrome.runtime.getURL(
      `options.html#/?target=editor&id=${script.id}`
    );

    chrome.tabs.create({ url: targetUrl });
  }

  /**
   * 切换脚本列表
   */
  tabClick(index: number) {
    this.scriptTab = index;
  }

  /**
   * 切换脚本运行状态
   */
  changScriptStaus(script: Script) {
    console.log(script);

    if (script.status === SCRIPT_STATUS_ENABLE) {
      script.status = SCRIPT_STATUS_DISABLE;
      this.scriptController.disable(script.id);
    } else {
      script.status = SCRIPT_STATUS_ENABLE;
      this.scriptController.enable(script.id);
    }
  }

  /**
   * 运行或者停止脚本
   */
  execOrStop(script: Script) {
    if (script.runStatus === "complete") {
      this.scriptController.exec(script.id, false).then(res => {
        console.log(res);
        if (res) {
          script.runStatus = SCRIPT_RUN_STATUS_RUNNING;
        }
      })
    } else {
      this.scriptController.stop(script.id, false).then(res => {
        if (res) {
          script.runStatus = SCRIPT_RUN_STATUS_COMPLETE;
        }
      })
    }
  }

  /**
   * 脚本自定义功能
   */
  menuClick(item: any) {
    MsgCenter.connect(TabMenuClick, item);
    window.close();
  }
}
</script>

<style scoped>
.wrapper {
  width: 100%;
  height: 100vh;
  display: flex;
  flex-direction: column;

  background-image: linear-gradient(0deg, #fff, #f3f5f8);
  box-shadow: 8px 8px 20px 0 rgb(55 99 170 / 10%), -8px -8px 20px 0 #fff;
  border-radius: 4px;
}

.top {
  padding: 12px 22px;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.title {
  flex-shrink: 0;
  font-weight: 500;
  font-size: 20px;
  color: inherit;
  line-height: 28px;
  white-space: nowrap;
}

.title:hover {
  color: #0052d9;
}

.top-rigth {
  box-sizing: border-box;
  display: flex;
  justify-content: flex-end;
}

.entries {
  padding: 12px 16px;
  position: relative;
  display: flex;
  flex-wrap: wrap;
}

.entries > li {
  display: inline-block;
  vertical-align: top;
  width: 33.33%;
  box-sizing: border-box;
  padding: 0 6px;
  margin-bottom: 12px;
}

.entry {
  display: block;
  box-sizing: border-box;
  height: 40px;
  background: #fff;
  border: 2px solid #fff;
  box-shadow: 8px 8px 20px 0 rgb(55 99 170 / 10%), -8px -8px 20px 0 #fff,
    inset 0 4px 20px 0 hsl(0deg 0% 100% / 50%);
  border-radius: 4px;
  font-size: 14px;
  color: #3d485d;
  line-height: 36px;
  text-align: center;
  padding: 0 10px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  transition: background 0.2s ease-in-out, box-shadow 0.3s ease-in-out;
}

.entry:hover {
  color: #0052d9;
  background: #f3f5f8;
  box-shadow: inset 8px 8px 20px 0 rgb(55 99 170 / 11%),
    inset -8px -8px 20px 0 #fff;
  border-color: transparent;
}

.tabs {
  /* margin: 0 auto; */
  height: 100%;
  display: flex;
  flex-direction: column;
}

.tabs__bar {
  position: relative;
  overflow: hidden;
  white-space: nowrap;
  text-align: center;
  margin: 0 auto;
  flex-shrink: 0;
}

.tb__list {
  position: relative;
  min-width: 100%;
  font-size: 0;
  list-style: none;
  text-align: center;
  vertical-align: top;
}

.tb__item {
  display: inline-block;
  vertical-align: top;
}

.tb__item.is-active .tb__item-cont {
  color: #0052d9;
}

.tb__item-cont {
  position: relative;
  cursor: pointer;
  padding: 0 20px 20px;
  text-align: center;
  font-size: 16px;
  color: #495770;
  line-height: 24px;
}

.tb__item.is-active .tb__item-cont::before {
  position: absolute;
  width: 30%;
  left: 50%;
  transform: translateX(-50%);
  bottom: 0;
  border-bottom: 4px solid #0052d9;
  content: "";
}

.tabs__cont {
  box-shadow: inset 8px 8px 20px 0 rgb(55 99 170 / 11%),
    inset -8px -8px 20px 0 #fff;
  padding: 20px;
  height: 100%;
}

.tb__cont-list {
}

.tb__cont-item {
  margin-bottom: 12px;
  display: flex;
  align-items: center;
  padding: 12px 20px;
  background-image: linear-gradient(0deg, #fff, #f3f5f8);
  border: 2px solid #fff;
  box-shadow: 8px 8px 20px 0 rgb(55 99 170 / 10%), -8px -8px 20px 0 #fff;
}

.tb__cont-item__name {
  margin-left: 8px;
  margin-right: auto;
  font-size: 14px;
  font-weight: 500;
  color: #000;
  line-height: 40px;
  max-width: 240px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.tb__cont-item__tip {
  font-size: 14px;
  font-weight: 500;
  color: #000;
  line-height: 40px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.menu-list {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
}

.menu-item {
  margin-right: 4px;
}

.btn {
  flex-shrink: 0;
  margin: 0 4px;
  position: relative;
  transition: all 0.2s ease;
  font-size: 12px;
  border-color: #d1d9e6;
  box-shadow: 3px 3px 6px #b8b9be, -3px -3px 6px #fff;
}

.btn-icon-only {
  position: relative;
  width: 40px;
  height: 40px;
  padding: 0;
}

.btn.btn-pill {
  border-radius: 100%;
}

.btn-primary {
  color: #31344b;
  background-color: #e6e7ee;
}

.btn-primary:hover {
  color: #31344b;
  background-color: #e6e7ee;
  border-color: #e6e7ee;
  box-shadow: inset 2px 2px 5px #b8b9be, inset -3px -3px 7px #fff;
}

.btn:hover {
  color: #44476a;
  text-decoration: none;
}

footer {
  padding: 6px;
}

footer > span {
  font-size: 14px;
  color: #98a3b7;
  line-height: 20px;
  white-space: nowrap;
}

li {
  list-style: none;
}

a {
  text-decoration: none;
}
</style>
