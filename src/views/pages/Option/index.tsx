import { Tab, TabPane } from "@components/Tab";
import eventBus from "@views/EventBus";
import { Component, Vue, Watch } from "vue-property-decorator";
import { VApp, VIcon } from "vuetify/lib";

import Carousel from "./Carousel.vue";
import EventType from "./EventType";
import Config from "./tabs/Config.vue";
import Logger from "./tabs/Logger.vue";
import ScriptList from "./tabs/ScriptList.vue";
import ScriptTab from "./tabs/ScriptTab/index.vue";
import Snackbar from "./Snackbar.vue";

import { scriptModule } from "@Option/store/script";

interface IExternalAction {
    target?: "editor";
    id?: string;
}

const SCRIPT_LIST_INDEX = 0;
const LOGGER_INDEX = 1;
const CONFIG_LIST_INDEX = 2;
const PLUS_INDEX = 3;

@Component({})
export default class App extends Vue {
    $refs!: {
        tabRef: Tab;
    };

    allTabs: ITabItem[] = [];

    // get allTabs() {
    //     return scriptModule.allTabs;
    // }

    // get activeTabIndex() {
    //     return scriptModule.currentActiveTabIndex;
    // }

    // @Watch("activeTabIndex")
    // changeActive(newIndex: number) {
    //     this.$nextTick(() => {
    //         this.$refs.tabRef.navigateToTab(newIndex);
    //         this.$forceUpdate();
    //     });
    // }

    // @Watch("toggleUpdateStatus")
    // toggleForceUpdate() {
    //     this.$nextTick(() => {
    //         this.$forceUpdate();
    //     });
    // }

    // get tabTitleMap() {
    //     return scriptModule.tabTitleMap;
    // }

    created() {
        eventBus.$on<INewScript>(EventType.NewScript, this.handleNewScript);
        eventBus.$on<IEditScript>(EventType.EditScript, this.handleEditScript);
        eventBus.$on<IChangeTitle>(EventType.ChangeTitle, this.handleChangeTitle);
    }

    generatePlusTab() {
        const tabKey = Math.random();

        return {
            tabKey,
            icon: <VIcon dense>mdi-plus</VIcon>,
            content: (
                <div
                    style={{
                        display: "flex",
                        height: "100%",
                    }}
                >
                    <ScriptTab tabKey={tabKey} onScriptIdChange={this.handleScriptIdChange} />
                </div>
            ),
            closable: false,
            keepAlive: false,
        };
    }

    generateScriptTab(scriptId: number): ITabItem {
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
                    <ScriptTab
                        tabKey={tabKey}
                        scriptId={scriptId}
                        onScriptIdChange={this.handleScriptIdChange}
                    />
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
                tabKey: LOGGER_INDEX,
                title: "运行日志",
                content: <Logger></Logger>,
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
            this.generatePlusTab(),
        );

        // 外部跳转
        this.$nextTick(() => {
            const query = (this.$route.query as unknown) as IExternalAction;

            if (query?.target === "editor") {
                // 编辑脚本
                this.handleEditScript({ scriptId: parseInt(query.id as string) });
            } else if (query?.target === "initial") {
                // 新建脚本
                this.activeTab(this.allTabs.length - 1);
            }
        });
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
            // 保留最后为PLUS，所以新添加的tab是倒数第二个
            scriptTabIndex = this.allTabs.length - 1;

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

    /** 在原PlusTab中保存了脚本时触发 */
    handleNewScript({}: INewScript) {
        // 如果在新建脚本tab中保存了脚本，那么将这个脚本移到一个新的tab中，并还原新建脚本这个tab为加号
        // 或者直接将当前tab视为普通ScriptTab，在最后添加一个PlusTab即可
        console.log("handleNewScript");

        this.allTabs.push(this.generatePlusTab());
    }

    handleScriptIdChange({ tabKey, scriptId }: IHandleScriptIdChange) {
        const scriptTab = this.allTabs.find((tab) => tab.tabKey == tabKey);

        if (scriptTab) {
            scriptTab.scriptId = scriptId;
        }
    }

    handleChangeTitle({ title, scriptId, initial }: IChangeTitle) {
        if (initial) {
            const newScriptIndex = this.allTabs.length - 1;

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
        }

        this.$forceUpdate();
    }

    handleTabRemove(index: number) {
        // const newTabs = [...this.allTabs];

        // this.$refs.tabRef.navigateToTab(0);
        this.activeTab(0);

        if (index === this.allTabs.length - 1) {
            this.updateTab({
                index,
                newTab: this.generatePlusTab(),
            });
        } else {
            this.allTabs.splice(index, 1);
        }

        // scriptModule.updateTabs(newTabs);
    }
    render() {
        return (
            <VApp>
                <div
                    style={{
                        height: "100%",
                        display: "flex",
                        flexDirection: "column",
                    }}
                >
                    <Carousel></Carousel>
                    <Snackbar />

                    <Tab ref="tabRef" onTabRemove={this.handleTabRemove}>
                        {this.allTabs.map((tab) => {
                            const { title, icon, content, tabKey, ...rest } = tab;

                            // let finalTitle: string | JSX.Element | undefined;
                            // if (typeof title === "string") {
                            //     if (
                            //         Object.keys(scriptModule.tabTitleMap).includes(
                            //             tabKey.toString(),
                            //         )
                            //     ) {
                            //         finalTitle = scriptModule.tabTitleMap[tabKey as number];
                            //     }
                            // } else {
                            //     finalTitle = title;
                            // }

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
