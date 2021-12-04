import { BackgroundGrant } from "@App/apps/grant/background";
import { grantListener } from "@App/apps/grant/content";
import { ScriptManager } from "@App/apps/script/manager";
import { Tab, TabPane } from "@components/Tab";
import eventBus from "@views/EventBus";
import { Component, Vue } from "vue-property-decorator";
import { VApp } from "vuetify/lib";
import EventType from "./EventType";
import Snackbar from "./Snackbar.vue";
import UserMenu from "@App/views/components/UserMenu.vue";
import { scriptModule } from "./store/script";
import Config from "./tabs/Config.vue";
import Logger from "./tabs/Logger.vue";
import Tools from "./tabs/Tools.vue";
import ScriptList from "./tabs/ScriptList.vue";
import ScriptTab from "./tabs/ScriptTab/index.vue";
import SubscribeList from "./tabs/SubscribeList.vue";
import { userModule } from "./store/user";

interface IExternalAction {
    target?: "editor";
    id?: string;
}

const SCRIPT_LIST_INDEX = 0;
const SUBSCRIBE_LIST_INDEX = 1;
const LOGGER_INDEX = 2;
const TOOLS_INDEX = 3;
const CONFIG_LIST_INDEX = 4;

@Component({})
export default class App extends Vue {
    $refs!: {
        tabRef: Tab;
    };

    allTabs: ITabItem[] = [];

    created() {
        eventBus.$on<ICreateScript>(EventType.NewScript, this.handleCreateScript);
        eventBus.$on<INewScript>(EventType.NewScript, this.handleNewScript);
        eventBus.$on<IEditScript>(EventType.EditScript, this.handleEditScript);
        eventBus.$on<IChangeTitle>(EventType.ChangeTitle, this.handleChangeTitle);
    }

    // generatePlusTab() {
    //     const tabKey = Math.random();

    //     return {
    //         tabKey,
    //         icon: <VIcon dense>mdiPlus</VIcon>,
    //         content: (
    //             <div
    //                 style={{
    //                     display: "flex",
    //                     height: "100%",
    //                 }}
    //             >
    //                 <ScriptTab tabKey={tabKey} />
    //             </div>
    //         ),
    //         closable: false,
    //         keepAlive: false,
    //     };
    // }

    generateScriptTab(
        scriptId: number,
        template: "normal" | "crontab" | "background" = "crontab",
    ): ITabItem {
        const tabKey = Math.random();

        return {
            tabKey,
            scriptId,
            title: `${scriptId}`,
            content: (
                <div
                    style={{
                        display: "flex",
                        height: "100%",
                    }}
                >
                    <ScriptTab tabKey={tabKey} scriptId={scriptId} template={template} />
                </div>
            ),
            closable: true,
            keepAlive: true,
            // beforeChange: (currentTab) => {
            //     return new Promise((resolve) => {
            //         console.log(currentTab);

            //         if (currentTab.title.startsWith("*")) {
            //             this.$confirm({
            //                 title: "注意",
            //                 text: "有未保存的更改，切换将丢失，确认要切换吗？",
            //                 acceptText: "确认切换",
            //                 cancelText: "取消",
            //             })
            //                 .then(() => {
            //                     // todo 去除tab title前的"* "
            //                     return resolve(true);
            //                 })
            //                 .catch(() => {
            //                     return resolve(false);
            //                 });
            //         } else {
            //             return resolve(true);
            //         }
            //     });
            // },
            beforeRemove: (currentTab) => {
                return new Promise((resolve) => {
                    console.log(currentTab);

                    if (currentTab.title.startsWith("*")) {
                        this.$confirm({
                            title: "注意",
                            text: "有未保存的更改，确认要关闭吗？",
                            acceptText: "确认",
                            cancelText: "取消",
                        })
                            .then(() => {
                                return resolve(true);
                            })
                            .catch(() => {
                                return resolve(false);
                            });
                    } else {
                        return resolve(true);
                    }
                });
            },
        };
    }

    mounted() {
        this.allTabs.push(
            {
                tabKey: SCRIPT_LIST_INDEX,
                title: "脚本列表",
                content: <ScriptList></ScriptList>,
                closable: false,
                lazy: false,
            },
            {
                tabKey: SUBSCRIBE_LIST_INDEX,
                title: "订阅列表",
                content: <SubscribeList></SubscribeList>,
                closable: false,
                lazy: false,
            },
            {
                tabKey: LOGGER_INDEX,
                title: "运行日志",
                content: <Logger></Logger>,
                closable: false,
                keepAlive: false,
            },
            {
                tabKey: TOOLS_INDEX,
                title: "系统工具",
                content: <Tools></Tools>,
                closable: false,
                keepAlive: false,
            },
            {
                tabKey: CONFIG_LIST_INDEX,
                title: "设置",
                content: <Config></Config>,
                closable: false,
                keepAlive: false,
            },
            // this.generatePlusTab(),
        );

        // 外部跳转
        this.$nextTick(() => {
            const query = (this.$route.query as unknown) as IExternalAction;

            if (query?.target === "editor") {
                // 编辑脚本
                this.handleEditScript({ scriptId: parseInt(query.id as string) });
            } else if (query?.target === "initial") {
                // 新建脚本
                eventBus.$emit<INewScript>(EventType.NewScript, { template: 'normal' } as any);
            }
        });
        // deubg用的bg
        let grant = BackgroundGrant.SingleInstance(
            new ScriptManager(),
            new grantListener(sandbox.window),
            true
        );
        grant.listenScriptGrant();
        // 监听调试返回消息
        window.addEventListener('message', event => {
            if (event.data.action != "exec respond") {
                return;
            }
            if (event.data.data == "success") {
                scriptModule.showSnackbar(
                    "脚本执行完成" + (event.data.result ? " 执行结果:" + event.data.result : "")
                );
            } else {
                scriptModule.showSnackbar(
                    "脚本执行失败" + (event.data.error ? " 执行结果:" + event.data.error : "")
                );
            }
        });

        // 用户登录
        userModule.checkUserinfo();
    }

    activeTab(index: number) {
        this.$refs.tabRef.navigateToTab(index);
    }

    updateTab({ index, newTab }: { index: number; newTab: ITabItem }) {
        this.allTabs.splice(index, 1, newTab);
    }

    appendTab({ index, newTab }: { index?: number; newTab: ITabItem }) {
        if (index) {
            this.allTabs.splice(index, 0, newTab);
        } else {
            this.allTabs.push(newTab);
        }
    }

    handleEditScript({ scriptId }: IEditScript) {
        let scriptTabIndex = this.allTabs.findIndex((tab) => tab.scriptId == scriptId);
        // 如果不存在，则新建
        if (scriptTabIndex === -1) {
            scriptTabIndex = this.allTabs.length;

            this.appendTab({
                index: scriptTabIndex,
                newTab: this.generateScriptTab(scriptId),
            });
        }

        //新建后跳转
        this.$nextTick(() => {
            this.activeTab(scriptTabIndex);
        });
    }

    // 创建新脚本进行编辑
    handleCreateScript() {
        this.activeTab(this.allTabs.length - 1);
    }

    /** 在原PlusTab中保存了脚本时触发 */
    handleNewScript({ scriptId, tabKey, template }: INewScript) {
        console.log("handleNewScript");

        // 需要知道是哪一个tab触发了保存事件，因为可能同时打开了多个“新建脚本”
        const scriptTabIndex = this.allTabs.findIndex((tab) => tab.tabKey == tabKey);

        console.log({
            scriptTabIndex,
        });

        this.updateTab({
            // -1时，说明目前并没有打开“新建脚本”，只有固定的3个基础页面，需要新开，即initial
            index: scriptTabIndex === -1 ? this.allTabs.length : scriptTabIndex,
            newTab: this.generateScriptTab(scriptId, template),
        });

        this.$nextTick(() => {
            if (scriptTabIndex === -1) {
                this.activeTab(this.allTabs.length - 1);
            } else {
                this.$nextTick(() => {
                    // 这种写法很不好，不过能用
                    // 这么写的原因，对应components/Tab/Tab.tsx中的onTabsChange，两个tick
                    this.activeTab(scriptTabIndex);
                });
            }
        });

        // 并还原新建脚本这个tab为加号
        // this.allTabs.push(this.generatePlusTab());
    }

    handleChangeTitle({ title, scriptId, initial, tabKey }: IChangeTitle) {
        if (initial) {
            // const newScriptIndex = this.allTabs.length - 1;
            const newScriptIndex = this.allTabs.findIndex((tab) => tab.tabKey == tabKey);

            console.log({
                newScriptIndex,
            });

            const newScriptTab = { ...this.allTabs[newScriptIndex] };

            newScriptTab.title = title;
            newScriptTab.icon = undefined;
            newScriptTab.closable = true;
            newScriptTab.keepAlive = true;

            this.allTabs[newScriptIndex] = newScriptTab;
        } else {
            if (!scriptId) {
                alert("title修改失败，未能识别scriptId");
            }

            const scriptTabIndex = this.allTabs.findIndex((tab) => tab.scriptId == scriptId);

            if (scriptTabIndex === -1) {
                return;
            } else {
                const scriptTab = { ...this.allTabs[scriptTabIndex] };
                scriptTab.title = title.length > 20 ? title.slice(0, 20) + "..." : title;
                this.allTabs[scriptTabIndex] = scriptTab;
            }

            eventBus.$emit(EventType.UpdateScriptList);
        }

        this.$forceUpdate();
    }

    handleTabRemove(index: number) {
        this.activeTab(0);

        // if (index === this.allTabs.length - 1) {
        //     this.updateTab({
        //         index,
        //         newTab: this.generatePlusTab(),
        //     });
        // } else {
        this.allTabs.splice(index, 1);
        // }
    }

    user = {
        username: "未登录",
        islogin: false
    };

    render() {
        return (
            <VApp>
                <v-app-bar color="#1296DB" dense dark>
                    <v-toolbar-title>ScriptCat</v-toolbar-title>
                    <v-spacer></v-spacer>
                    <UserMenu />
                </v-app-bar>
                <div
                    style={{
                        height: "100%",
                        display: "flex",
                        flexDirection: "column",
                    }}
                >
                    <Snackbar />
                    <Tab ref="tabRef" onTabRemove={this.handleTabRemove}>
                        {this.allTabs.map((tab) => {
                            const { title, icon, content, tabKey, ...rest } = tab;

                            const finalTitle = title;

                            return (
                                <TabPane
                                    // key是必须的，尤其是需要删除列表元素时
                                    // key不能是index，删除时会出现复用元素(即元素未更新)的问题
                                    // key必须唯一
                                    key={tabKey}
                                    {...{ props: rest }}
                                    title={typeof finalTitle === "string" ? finalTitle : undefined}
                                >
                                    {finalTitle && typeof finalTitle !== "string" && (
                                        <div slot="title"> {finalTitle} </div>
                                    )}
                                    {icon && <div slot="icon"> {icon}</div>}
                                    {content}
                                </TabPane>
                            );
                        })}
                    </Tab>
                </div>
            </VApp>
        );
    }
}
