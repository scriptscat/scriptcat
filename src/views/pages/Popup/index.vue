<template>
  <!-- <div :style="{ width: '500px', height: '500px' }"> -->
  <Tab>
    <TabPane title="已安装" :keepAlive="true">
      <v-list dense>
        <v-list-item-group
          :value="false"
          no-action
          v-for="(item, i) in items"
          :key="i"
        >
          <v-list-item-action>
            <v-switch></v-switch>
          </v-list-item-action>

          <template v-slot:activator>
            <v-list-item-content>
              <v-list-item-title>scriptName</v-list-item-title>
            </v-list-item-content>
          </template>

          <v-list-item v-for="child in item.items" :key="child.title">
            <v-list-item-content>
              <v-list-item-title v-text="child.title"></v-list-item-title>
            </v-list-item-content>
          </v-list-item>
        </v-list-item-group>
      </v-list>
    </TabPane>
    <TabPane title="后台"></TabPane>
    <TabPane title="可用"> 可用脚本包含已安装脚本，突出一下</TabPane>
  </Tab>
  <!-- </div> -->
</template>

<script lang="ts">
import { Vue, Component } from "vue-property-decorator";

import { Tab, TabPane } from "@App/views/components/Tab";

@Component({
  components: {
    Tab,
    TabPane,
  },
})
export default class App extends Vue {
  selectedItem = 1;
  items = [
    {
      action: "mdi-ticket",
      items: [{ title: "List Item" }],
      title: "Attractions",
    },
    {
      action: "mdi-silverware-fork-knife",
      active: true,
      items: [
        { title: "Breakfast & brunch" },
        { title: "New American" },
        { title: "Sushi" },
      ],
      title: "Dining",
    },
    {
      action: "mdi-school",
      items: [{ title: "List Item" }],
      title: "Education",
    },
    {
      action: "mdi-run",
      items: [{ title: "List Item" }],
      title: "Family",
    },
    {
      action: "mdi-bottle-tonic-plus",
      items: [{ title: "List Item" }],
      title: "Health",
    },
    {
      action: "mdi-content-cut",
      items: [{ title: "List Item" }],
      title: "Office",
    },
    {
      action: "mdi-tag",
      items: [{ title: "List Item" }],
      title: "Promotions",
    },
  ];
}
</script>

<style>
</style>