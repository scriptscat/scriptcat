import { Tab, TabPane } from "@components/Tab";
import eventBus from "@views/EventBus";
import { Component, Vue } from "vue-property-decorator";
import { VApp, VIcon } from "vuetify/lib";

import Carousel from "./Carousel.vue";
import Config from "./tabs/Config.vue";
import Logger from "./tabs/Logger.vue";
import ScriptList from "./tabs/ScriptList.vue";
import ScriptTab from "./tabs/ScriptTab/index.vue";

interface ITabItem {
    tabKey: string | number;
    title?: string | JSX.Element;
    icon?: JSX.Element;
    content?: JSX.Element;
    closable?: boolean;
    lazy?: boolean;
    keepAlive?: boolean;
    scriptId?: number;
    beforeChange?: (tabPane: TabPane) => Promise<boolean>;
    beforeRemove?: (tabPane: TabPane) => Promise<boolean>;
}

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

    created() {
        eventBus.$on<IEditScript>("edit-script", this.handleEditScript);
        eventBus.$on<INewScript>("new-script", this.handleNewScript);
        eventBus.$on<IChangeTitle>("change-title", this.handleChangeTitle);
    }

    generatePlusTab() {
        return {
            tabKey: PLUS_INDEX,
            icon: <VIcon dense>mdi-plus</VIcon>,
            content: (
                <div
                    style={{
                        display: "flex",
                        height: "100%",
                    }}
                >
                    <ScriptTab />
                </div>
            ),
            closable: false,
            keepAlive: false,
        };
    }

    generateScriptTab(scriptId: number): ITabItem {
        return {
            tabKey: Math.random(),
            scriptId,
            title: `${scriptId}`,
            content: (
                <div
                    style={{
                        display: "flex",
                        height: "100%",
                    }}
                >
                    <ScriptTab scriptId={scriptId} />
                </div>
            ),
            closable: true,
            keepAlive: false,
            beforeChange: (currentTab) => {
                return new Promise((resolve) => {
                    console.log(currentTab);

                    if (currentTab.title.startsWith("*")) {
                        this.$confirm({
                            title: "注意",
                            text: "有未保存的更改，切换将丢失，确认要切换吗？",
                            acceptText: "确认切换",
                            cancelText: "取消",
                        })
                            .then(() => {
                                // todo 去除tab title前的"* "
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

        this.$nextTick(() => {
            // 外部跳转
            console.log(this.$route);

            const query = (this.$route.query as unknown) as IExternalAction;

            if (query?.target === "editor") {
                this.handleEditScript({ scriptId: parseInt(query.id as string) });
            }
        });
    }

    handleEditScript({ scriptId }: IEditScript) {
        const scriptTabIndex = this.allTabs.findIndex((tab) => tab.scriptId == scriptId);
        // 如果不存在
        if (scriptTabIndex === -1) {
            // 则新建
            this.allTabs.push(this.generateScriptTab(scriptId));
        }

        //新建后跳转
        this.$nextTick(() => {
            this.$refs.tabRef.navigateToTab(
                scriptTabIndex === -1 ? this.allTabs.length - 1 : scriptTabIndex,
            );
        });
    }

    handleNewScript({ scriptId }: INewScript) {
        // 如果在新建脚本tab中保存了脚本，那么将这个脚本移到一个新的tab中，并还原新建脚本这个tab为加号
        // this.allTabs.splice(PLUS_INDEX, 1, this.generatePlusTab());
        this.allTabs[PLUS_INDEX] = this.generatePlusTab();
        this.$forceUpdate();

        this.allTabs.push(this.generateScriptTab(scriptId));

        //新建后跳转
        this.$nextTick(() => {
            this.$refs.tabRef.navigateToTab(this.allTabs.length - 1);
        });
    }

    handleChangeTitle({ title, scriptId, initial }: IChangeTitle) {
        if (initial) {
            const newScriptTab = {
                ...(this.allTabs.find((tab) => tab.tabKey === PLUS_INDEX) as ITabItem),
            };

            newScriptTab.title = title;
            newScriptTab.icon = undefined;
            newScriptTab.closable = true;

            this.allTabs[PLUS_INDEX] = newScriptTab;
        } else {
            const scriptTabIndex = this.allTabs.findIndex((tab) => tab.scriptId == scriptId);

            if (scriptTabIndex === -1) {
                return;
            } else {
                const scriptTab = { ...this.allTabs[scriptTabIndex] };
                console.error(scriptTab);
                scriptTab.title = title.length > 20 ? title.slice(0, 20) + "..." : title;
                this.allTabs[scriptTabIndex] = scriptTab;
            }
        }

        this.$forceUpdate();
    }

    manualNavigateFlag = false;

    handleTabRemove(index: number) {
        if (index === PLUS_INDEX) {
            // vue未监听通过index修改array的方式，所以手动update
            // this.allTabs[PLUS_INDEX] = newScriptTab;
            // this.$forceUpdate();
            // 或者直接splice替换
            this.$refs.tabRef.navigateToTab(0);
            this.allTabs.splice(index, 1, this.generatePlusTab());

            // 当tabChange时，tab组件内部会自动navigate一次，
            // 所以要保证，手动的navigate发生在自动调用之后
            // 配合onActiveTab回调使用
            // todo activePattern设置为head之后，似乎没必要手动navigate了？
            // this.manualNavigateFlag = true;
        } else {
            this.allTabs.splice(index, 1);
        }
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

                    <Tab
                        ref="tabRef"
                        onTabRemove={this.handleTabRemove}
                        // onActiveTab={() => {
                        // if (this.manualNavigateFlag) {
                        //     this.manualNavigateFlag = false;
                        //     this.$refs.tabRef.navigateToTab(0);
                        // }
                        // }}
                    >
                        {this.allTabs.map((tab) => {
                            const { title, icon, content, tabKey, ...rest } = tab;

                            return (
                                <TabPane
                                    // key是必须的，尤其是需要删除列表元素时
                                    // key不能是index，删除时会出现复用元素(即元素未更新)的问题
                                    // key必须唯一
                                    key={tabKey}
                                    {...{ props: rest }}
                                    title={typeof title === "string" ? title : undefined}
                                >
                                    {title && typeof title !== "string" && (
                                        <div slot="title"> {title} </div>
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
