import Vue from "vue";
import Vuex from "vuex";

Vue.config.devtools = true;
Vue.use(Vuex);

export default new Vuex.Store({
    /*
    Ideally if all your modules are dynamic
    then your store is registered initially
    as a completely empty object
    */
});
