import Vue from "vue";

interface IVuetifyDialogOptions {
    /** ISO locale identifier for the button labels. Over 30 locales are supported. To override, see the properties below. */
    locale?: string;
    /** Label for accept button in dialog */
    acceptText?: string;
    /** Label for cancel button in dialog */
    cancelText?: string;
    /** Label for close button in snackbar message */
    closeText?: string;
    /** Position of snackbar message */
    snackbarX?: "left" | "center" | "right";
    /** Position of snackbar message */
    snackbarY?: "top" | "bottom";
    /** Snackbar duration in milliseconds */
    snackbarTimeout?: integer;
    /** Max width of dialog in pixels */
    dialogMaxWidth?: integer;
    theme?: any;
    title?: string;
    text?: string;
}

declare module "vue/types/vue" {
    // 3. 声明为 Vue 补充的东西
    interface Vue {
        $emit<T = any>(event: string, payload: T): void;
        $on<T = any>(event: string | string[], callback: (payload: T) => any): void;
        $confirm(options: IVuetifyDialogOptions): Promise<any>;
        $router: VueRouter,
        $route: Route
    }
}
