import { Vue, Component } from "vue-property-decorator";

import eventBus from "@App/views/EventBus";
import Tab from "@App/views/components/Tab";
import TabPane from "@App/views/components/Tab/TabPane";

import Test from "../../components/Test.vue";

import Edit from "./Editor.vue";
import List from "./ScriptList.vue";
import Logger from "./Logger.vue";

interface ITabItem {
    title?: string | JSX.Element;
    icon?: JSX.Element;
    content?: JSX.Element;
    closable?: boolean;
    lazy?: boolean;
    keepAlive?: boolean;
}

@Component({})
export default class App extends Vue {
    fixedTabs: ITabItem[] = [];

    editTabs: ITabItem[] = [];

    created() {
        this.fixedTabs.push(
            {
                title: "脚本列表",
                content: <List></List>,
                closable: true,
                lazy: false,
            },
            {
                title: "运行日志",
                content: <Logger></Logger>,
                closable: true,
                keepAlive: false,
            },
            {
                title: "新建脚本",
                icon: <v-icon small> mdi-plus </v-icon>,
                content: <Edit></Edit>,
                closable: false,
            },
        );
    }

    // get test() {
    //     return [
    //         {
    //             title: "脚本列表",
    //             content: <List></List>,
    //             closable: true,
    //             lazy: false,
    //         },
    //         {
    //             title: "新建脚本",
    //             icon: <v-icon small> mdi-plus </v-icon>,
    //             content: <Edit></Edit>,
    //             closable: false,
    //         },
    //         {
    //             title: "运行日志",
    //             content: <Logger></Logger>,
    //             closable: true,
    //             keepAlive: false,
    //         },
    //     ];
    // }

    // public get allTabs(): ITabItem[] {
    //     return [...this.fixedTabs, ...this.editTabs];
    // }

    // created() {
    //     eventBus.$on("edit-script", this.handleEditScript);
    // }

    // handleEditScript(scriptId: string) {
    //     const scriptTab = this.editTabs.find((tab) => tab.scriptId === scriptId);
    //     // 如果不存在
    //     if (!scriptTab) {
    //         // 则新建
    //         this.editTabs.push({
    //             type: "edit",
    //             scriptId,
    //             routeTo: `/edit/${scriptId}`,
    //             title: `${scriptId}`,
    //         });
    //     }

    //     // this.routeTo(`/edit/${scriptId}`);
    // }

    // closeEditTab(scriptId: string) {
    //     const scriptTabIndex = this.editTabs.findIndex((tab) => tab.scriptId === scriptId);

    //     if (scriptTabIndex !== -1) {
    //         this.editTabs.splice(scriptTabIndex, 1);
    //     }
    // }

    // routeTo(path: string) {
    //     this.$router.push(path);
    // }

    removeTab(index: number) {
        this.fixedTabs.splice(index, 1);
    }

    render() {
        return (
            <div style={{ height: "100%" }}>
                <div style={{ height: "10%" }}>
                    <span>script cat logo</span>
                    <span>ScriptCat Next Generation Script Manager</span>
                </div>

                <Tab onTabRemove={this.removeTab}>
                    {this.fixedTabs.map((tab) => {
                        const { title, icon, content, ...rest } = tab;

                        return (
                            <TabPane
                                {...{ props: rest }}
                                title={typeof title === "string" && title}
                            >
                                {title && typeof title !== "string" && <title> {title} </title>}
                                {icon && <icon>{icon}</icon>}
                                {content}
                            </TabPane>
                        );
                    })}
                </Tab>
            </div>
        );
        {
            /* <v-tabs background-color="cyan" v-model="allTabs">
      <v-tab
        v-for="tab in allTabs"
        :key="tab.title || tab.icon"
        :to="tab.routeTo"
        tag="div"
      >
        <template
          v-if="tab.type === 'edit'"
          :style="{
            display: 'flex',
            justifyContent: 'space-around',
          }"
        >
          {{ tab.title }}
          <v-icon
            @click="closeEditTab(tab.scriptId)"
            :style="{ marginLeft: 30 }"
            >mdi-phone</v-icon
          >
        </template>
        <template v-else>
          {{ tab.title }}
        </template>
      </v-tab>
    </v-tabs> */
        }

        {
            /* <div style="margin-top: 10px; height: 80%">
      <router-view></router-view>
    </div>  */
        }
    }
}
