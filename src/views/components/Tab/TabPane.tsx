import { VNode } from "vue";
import { Vue, Component, Provide, Prop, Watch } from "vue-property-decorator";

import Tab from "./index";

const noop = () => {};

@Component({})
export default class TabPane extends Vue {
    $parent!: Tab;

    @Prop({ default: "" }) title!: string;
    @Prop({ default: "" }) icon!: string;
    @Prop({ default: null }) tabData!: any;
    @Prop({ default: false }) closable!: boolean;
    @Prop({ default: true }) keepAlive!: boolean;
    @Prop({ default: true }) lazy!: boolean;
    /***
     * Function to execute before tab switch. Return value must be boolean
     * If the return result is false, tab switch is restricted
     */
    @Prop({ default: noop }) beforeChange!: Function;
    @Prop() id!: string;
    @Prop() route!: string | any;
    @Prop() disabled!: boolean;
    @Prop() transitionName!: string;
    @Prop() transitionMode!: string;

    active = false;
    validationError = null;
    loaded = false;

    get isValidParent() {
        return this.$parent.$options.name === "Tab";
    }
    get hash() {
        return `#${this.id}`;
    }
    get tabId() {
        return this.id ? this.id : this.title;
    }

    mounted() {
        if (this.isValidParent) {
            this.$parent.addTab(this);
        }
    }

    destroyed() {
        console.log(`${this.tabId} has been destroyed`);

        if (this.$el && this.$el.parentNode) {
            this.$el.parentNode.removeChild(this.$el);
        }
        this.$parent.removeTab(this);
    }

    render() {
        let loadContentFlag: boolean = false;
        let needToFigureIsActiveAndKeepAlive: boolean = false;

        // 判断懒加载
        if (this.lazy) {
            if (this.loaded) {
                needToFigureIsActiveAndKeepAlive = true;
            }
        } else {
            needToFigureIsActiveAndKeepAlive = true;
        }

        if (needToFigureIsActiveAndKeepAlive) {
            if (this.active) {
                loadContentFlag = true;
            } else {
                if (this.keepAlive) {
                    // 未显示时，是否销毁
                    loadContentFlag = true;
                }
            }
        }

        return (
            <section
                class="tab-container"
                id={`p-${this.tabId}`}
                aria-labelledby={`t-${this.tabId}`}
                role="tabpanel"
                v-show={this.active}
            >
                {loadContentFlag && this.$slots.default}
            </section>
        );
    }
}
