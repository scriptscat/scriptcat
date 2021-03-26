import Vue from "vue";

declare module "vue/types/vue" {
    // 3. 声明为 Vue 补充的东西
    interface Vue {
        $emit<T = any>(event: string, payload: T): void;
        $on<T = any>(event: string | string[], callback: (payload: T) => any): void;
    }
}
