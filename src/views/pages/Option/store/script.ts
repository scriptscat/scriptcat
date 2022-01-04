import {
    Action,
    Module,
    Mutation,
    MutationAction,
    VuexModule,
    getModule,
} from 'vuex-module-decorators';

import store from './index';

@Module({
    name: 'script',
    store,
    dynamic: true,
})
class ScriptModule extends VuexModule {
    // tabTitleMap: { [tabKey: number]: string } = {};

    // @Mutation
    // updateTitle({}: { tabKey: number; title: string }) {}

    snackbar = false;
    snackbarInfo = '';

    @Mutation
    showSnackbar(message: string) {
        this.snackbar = true;
        this.snackbarInfo = message;
        setTimeout(() => {
            this.snackbar = false;
        }, 4000);
    }

    @Mutation
    updateSnackbarStatus(status: boolean) {
        this.snackbar = status;
    }
}

const scriptModule = getModule(ScriptModule);
export { scriptModule };
