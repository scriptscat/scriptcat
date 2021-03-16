import Vue from 'vue'
import App from '@App/views/install.vue'
import { languages } from "monaco-editor";
import dts from "@App/tampermonkey.d.ts";
import Vuetify from "vuetify";
import "vuetify/dist/vuetify.min.css";
import { migrate } from './model/migrate';

migrate();

Vue.use(Vuetify);

const opts = {};
const vuetifyInstance = new Vuetify(opts);

// @ts-ignore
self.MonacoEnvironment = {
    getWorkerUrl: function (moduleId: any, label: any) {
        if (label === 'typescript' || label === 'javascript') {
            return './src/ts.worker.js';
        }
        return './src/editor.worker.js';
    }
};

languages.typescript.javascriptDefaults.addExtraLib(dts, "tampermonkey.d.ts");

new Vue({
    vuetify: vuetifyInstance,
    render: h => h(App),
}).$mount('#app');