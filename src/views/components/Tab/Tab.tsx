import './default.css';

import { VNode } from 'node_modules/vue/types';
import { Component, Prop, Provide, Vue, Watch } from 'vue-property-decorator';

import CloseButton from './CloseButton.vue';
import TabPane from './TabPane';

interface ITabItem { }

const noop = () => { };

@Component({
    components: {
        // CloseButton,
    },
})
export default class Tab extends Vue {
    @Prop() activeTabColor!: string;
    @Prop() activeTextColor!: string;
    @Prop() disabledColor!: string;
    @Prop() disabledTextColor!: string;
    /** Tab style type */
    @Prop({ default: 'tabs' }) type!: 'tabs' | 'pills';
    @Prop({ default: 'head' }) activePattern!: 'head' | 'near';
    /** Centers the tabs and makes the container div full width */
    @Prop({ default: false }) centered!: boolean;
    @Prop({ default: true }) overflow!: boolean;
    @Prop() value!: string | number | any;
    /** 当所有tabPane添加至tab后的nextTick，可以假定所有TabPane已经mounted？ */
    @Prop({ default: noop }) whenReady!: () => Promise<any>;

    activeTabIndex = 0;
    tabs: TabPane[] = [];

    // closedTabs: VNode[] = [];

    get isTabShape() {
        return this.type === 'tabs';
    }
    get classList() {
        const navType = this.isTabShape ? 'nav-tabs' : 'nav-pills';
        const centerClass = this.centered ? 'nav-justified' : '';
        return `nav ${navType} ${centerClass}`;
    }
    get activeTabStyle() {
        return {
            backgroundColor: this.activeTabColor,
            color: this.activeTextColor,
        };
    }

    @Watch('tabs')
    onTabsChange(newTabs: TabPane[]) {
        if (newTabs.length > 0) {
            if (this.value) {
                this.findTabAndActivate(this.value);
            } else {
                if (newTabs.length <= this.activeTabIndex) {
                    if (this.activePattern === 'head') {
                        this.activateTab(0);
                    } else {
                        this.activateTab(this.activeTabIndex - 1);
                    }
                } else {
                    this.activateTab(this.activeTabIndex);
                }
            }
        }
    }

    @Watch('value')
    onValueChange(newVal: any) {
        this.findTabAndActivate(newVal);
    }

    findTabAndActivate(tabNameOrIndex: string | number) {
        const indexToActivate = this.tabs.findIndex(
            (tab, index) => tab.title === tabNameOrIndex || index === tabNameOrIndex,
        );
        // if somehow activeTabIndex is not reflected in the actual vue-tab instance, set it.
        if (indexToActivate === this.activeTabIndex && !this.tabs[this.activeTabIndex].active) {
            this.tabs[this.activeTabIndex].active = true;
        }
        if (indexToActivate !== -1) {
            this.changeTab(this.activeTabIndex, indexToActivate);
        } else {
            this.changeTab(this.activeTabIndex, 0);
        }
    }

    navigateToTab(index: number, route = '') {
        console.log(`navigate to ${index}`);

        if (index !== this.activeTabIndex) {
            this.changeTab(this.activeTabIndex, index, route);
        } else {
            console.error('refuse to navigate to same tab');
        }
    }

    async changeTab(oldIndex: number, newIndex: number, route = '') {
        const oldTab = this.tabs[oldIndex] || {};

        const continueFlag = await oldTab.beforeChange(oldTab);

        if (continueFlag) {
            const newTab = this.tabs[newIndex];

            oldTab.active = false;

            if (newTab) {
                // 点击tabTitle触发删除时，也会触发click，从而导致触发当前方法
                // 而此时，tab已被删除，所以会出现undefined问题
                if (!newTab.disabled) {
                    this.activateTab(newIndex);
                }
            }

            this.$emit('tab-change', newIndex, newTab, oldTab);
            this.tryChangeRoute(route);
        } else {
            console.error('navigate has been blocked cause of beforeChange hook');
        }
    }

    activateTab(index: number) {
        this.activeTabIndex = index;
        const tab = this.tabs[index];
        tab.active = true;

        if (tab.loaded === false) {
            tab.loaded = true;
        }
        this.$emit('activeTab', tab.title);
    }

    tryChangeRoute(route: string) {
        if (this.$router && route) {
            this.$router.push(route);
        }
    }

    addTab(item: TabPane) {
        const index = this.$slots.default!.indexOf(item.$vnode);
        this.tabs.splice(index, 0, item);
    }

    removeTab(item: TabPane) {
        const tabs = this.tabs;
        const index = tabs.indexOf(item);
        if (index > -1) {
            tabs.splice(index, 1);
        }

        // const closedTabIndex = this.closedTabs.indexOf(item.$vnode);
        // if (closedTabIndex === -1) {
        //     this.closedTabs.push(item.$vnode);
        // }
    }

    // getTabs() {
    //     if (this.$slots.default) {
    //         return this.$slots.default.filter((comp) => comp.componentOptions);
    //     }
    //     return [];
    // }

    renderTabTitle(index: number) {
        if (this.tabs.length === 0) return;
        const tab = this.tabs[index];
        const { active, title } = tab;
        const titleStyles = { color: this.activeTabColor };
        titleStyles.color = this.activeTextColor;

        if (tab.$slots.title) {
            // 如果直接为TabPane提供了TitleSlot
            return tab.$slots.title;
        } else if (tab.$scopedSlots.title) {
        }
        // 作用域插槽
        // return tab.$scopedSlots.title({
        //     active: active,
        //     title: title,
        //     icon: tab.icon,
        //     data: tab.tabData,
        // });
        else {
            const simpleTitle = (
                <span class={'title'} style={active ? titleStyles : {}}>
                    {/* {this.renderIcon(index)} */}
                    {title}
                </span>
            );

            return simpleTitle;
            // if (!tab.$slots.icon) {
            //     return <div>no title or icon</div>;
            // }
        }
    }

    renderIcon(index: number) {
        if (this.tabs.length === 0) return;

        const tab = this.tabs[index];

        if (tab.$slots.icon) {
            return <div class="title">{tab.$slots.icon}</div>;
        } else {
            const { icon } = tab;
            if (icon) {
                const simpleIcon = <i class={icon}>&nbsp;</i>;
                return simpleIcon;
            }
        }
    }

    tabStyles(tab: any) {
        if (tab.disabled) {
            return {
                backgroundColor: this.disabledColor,
                color: this.disabledTextColor,
            };
        }
        return {};
    }

    renderTabs() {
        return this.tabs.map((tab, index) => {
            if (!tab) return;
            const { route, id, title, icon, tabId, tabKey } = tab;
            const active = this.activeTabIndex === index;

            const closeButton = (
                <CloseButton
                    tab={tab}
                    index={index}
                    onTabRemove={() => {
                        this.$emit('tabRemove', index);
                    }}
                    style={{
                        marginLeft: '5px',
                    }}
                />
            );

            return (
                <li
                    name="tab"
                    class={['tab', { active: active }, { disabled: tab.disabled }]}
                    key={tabKey}
                    id={`t-${tabId}`}
                    aria-selected={active}
                    aria-controls={`p-${tabId}`}
                    role="tab"
                    v-ripple
                    style={{ fontSize: '16px' }}
                    onClick={() => !tab.disabled && this.navigateToTab(index, route)}
                >
                    <a
                        href="#"
                        // vOn:click_stop_prevent={(e: Event) => {
                        //     e.preventDefault();
                        //     return false;
                        // }}
                        // onClick
                        style={active ? this.activeTabStyle : this.tabStyles(tab)}
                        class={[{ active_tab: active }, 'tabs__link']}
                        role="tab"
                    >
                        {this.renderIcon(index)}
                        {this.renderTabTitle(index)}
                        {tab.closable && closeButton}
                    </a>
                </li>
            );
        });
    }

    render() {
        const tabList = this.renderTabs();

        return (
            <div class={['vue-tabs']}>
                <div class={['nav-tabs-navigation']}>
                    <div class={['nav-tabs-wrapper']}>
                        <ul class={this.classList} role="tablist">
                            {tabList}
                        </ul>
                    </div>
                </div>
                <div class={['tab-content']}>
                    {this.$slots.default}
                    {/* {this.$slots.default?.filter((item) => !this.closedTabs.includes(item))} */}
                    {/* {this.tabs.map((tab) => tab)} */}
                </div>
            </div>
        );
    }
}
