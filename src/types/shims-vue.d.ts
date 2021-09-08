/*
 * @Author: Przeblysk
 * @Date: 2021-09-03 01:33:24
 * @LastEditTime: 2021-09-04 15:18:26
 * @LastEditors: Przeblysk
 * @Description: 
 * @FilePath: /scriptcat/src/types/shims-vue.d.ts
 * 
 */
declare module "*.vue" {
    import Vue from "vue";
    export default Vue;
}

declare module "@qvant/qui"
declare module "@qvant/qui/src/onDemand"
declare module "@qvant/qui/src/qComponents/QButton"
declare module "@qvant/qui/src/qComponents/QCheckbox"
declare module "@qvant/qui/src/qComponents/QPopover"
declare module "@qvant/qui/src/qComponents/QScrollbar"