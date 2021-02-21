import Vue from 'vue'
import App from '@App/views/options.vue'
import Home from "@App/views/options/home.vue"
import Edit from "@App/views/options/edit.vue"
import Logger from "@App/views/options/logger.vue"
import VueRouter, { RouteConfig } from 'vue-router'

Vue.use(VueRouter);

const routes: Array<RouteConfig> = [
    {
        path: '/',
        name: 'Home',
        component: Home,
    },
    {
        path: '/edit/:id?',
        name: 'Edit',
        component: Edit,
    },
    {
        path: '/logger',
        name: 'Logger',
        component: Logger,
    },
]
console.log(routes);
const router = new VueRouter({
    mode: 'hash',
    base: 'options.html',
    routes
})

new Vue({
    router,
    render: h => h(App),
}).$mount('#app')
