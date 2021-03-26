import { Vue, Component } from "vue-property-decorator";
import { VIcon } from "vuetify/lib";

import eventBus from "@App/views/EventBus";
import { Tab, TabPane } from "@App/views/components/Tab";

import Editor from "./Editor.vue";
import ScriptList from "./ScriptList.vue";
import Logger from "./Logger.vue";

interface ITabItem {
    tabKey: string | number;
    title?: string | JSX.Element;
    icon?: JSX.Element;
    content?: JSX.Element;
    closable?: boolean;
    lazy?: boolean;
    keepAlive?: boolean;
    scriptId?: number;
}

@Component({})
export default class App extends Vue {
    $refs!: {
        tabRef: Tab;
    };

    allTabs: ITabItem[] = [];

    created() {
        eventBus.$on<IEditScript>("edit-script", this.handleEditScript);
        // todo 如果是在新建脚本tab中保存了脚本，那么将这个脚本移到一个新的tab中，并还原新建脚本这个tab
        eventBus.$on<any>("save-script", this.handleSaveScript);
        eventBus.$on<IChangeTitle>("change-title", this.handleChangeTitle);
    }

    mounted() {
        this.allTabs.push(
            {
                tabKey: 0,
                title: "脚本列表",
                content: <ScriptList></ScriptList>,
                closable: false,
                lazy: false,
            },
            {
                tabKey: 1,
                title: "运行日志",
                content: <Logger></Logger>,
                closable: false,
                keepAlive: false,
            },
            {
                tabKey: 2,
                icon: <VIcon small>mdi-plus</VIcon>,
                content: <Editor></Editor>,
                closable: false,
                keepAlive: true,
            },
        );
    }

    handleEditScript({ scriptId }: IEditScript) {
        const scriptTabIndex = this.allTabs.findIndex((tab) => tab.scriptId == scriptId);
        // 如果不存在
        if (scriptTabIndex === -1) {
            // 则新建
            this.allTabs.push({
                tabKey: Math.random(),
                scriptId,
                title: `${scriptId}`,
                content: <Editor scriptId={scriptId}></Editor>,
                closable: true,
                keepAlive: false,
            });
        }

        this.$nextTick(() => {
            this.$refs.tabRef.navigateToTab(
                scriptTabIndex === -1 ? this.allTabs.length - 1 : scriptTabIndex,
            );
        });
    }

    handleSaveScript() {}

    handleChangeTitle({ title, scriptId, initial }: IChangeTitle) {
        if (initial) {
            const newScriptTab = { ...(this.allTabs.find((tab) => tab.tabKey === 2) as ITabItem) };

            newScriptTab.title = title;
            newScriptTab.icon = undefined;
            newScriptTab.closable = true;

            this.allTabs[2] = newScriptTab;
        } else {
            const scriptTabIndex = this.allTabs.findIndex((tab) => tab.scriptId == scriptId);

            if (scriptTabIndex === -1) {
                return;
            } else {
                const scriptTab = { ...this.allTabs[scriptTabIndex] };
                console.error(scriptTab);
                scriptTab.title = title;
                this.allTabs[scriptTabIndex] = scriptTab;
            }
        }

        this.$forceUpdate();
    }

    removeTab(index: number) {
        if (index === 2) {
            const newScriptTab = { ...(this.allTabs.find((tab) => tab.tabKey === 2) as ITabItem) };

            newScriptTab.title = undefined;
            newScriptTab.icon = <VIcon small>mdi-plus</VIcon>;
            newScriptTab.closable = false;

            this.allTabs[2] = newScriptTab;
            this.$forceUpdate();

            this.$nextTick(() => {
                // todo 此处未起到作用
                this.$refs.tabRef.navigateToTab(0);
            });
        } else {
            this.allTabs.splice(index, 1);
        }
    }

    render() {
        return (
            <div style={{ height: "100%" }}>
                <div style={{ display: "grid", placeItems: "center" }}>
                    <div
                        style={{
                            width: "100px",
                            height: "100px",
                        }}
                    >
                        script cat logo
                    </div>
                    <div
                        style={{
                            fontSize: "24px",
                        }}
                    >
                        ScriptCat Next Generation Script Manager
                    </div>
                </div>

                <Tab onTabRemove={this.removeTab} ref="tabRef">
                    {this.allTabs.map((tab) => {
                        const { title, icon, content, ...rest } = tab;

                        return (
                            <TabPane
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
        );
    }
}
