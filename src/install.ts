import Vue from 'vue'
import App from '@App/views/install.vue'

// @ts-ignore
self.MonacoEnvironment = {
    getWorkerUrl: function (moduleId: any, label: any) {
        if (label === 'typescript' || label === 'javascript') {
            return './ts.worker.bundle.js';
        }
        return './editor.worker.bundle.js';
    }
};

new Vue({
    render: h => h(App),
}).$mount('#app');