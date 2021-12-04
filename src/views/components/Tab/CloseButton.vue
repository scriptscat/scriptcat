<template>
  <v-icon @click.stop="onClick" small>{{ icons.mdiClose }}</v-icon>
</template>

<script lang="ts">
import { Component, Prop, Vue } from "vue-property-decorator";
import TabPane from "./TabPane";
import { mdiClose } from "@mdi/js";

@Component({})
export default class CloseButton extends Vue {
  icons = { mdiClose };

  @Prop() tab!: TabPane;
  @Prop() index!: number;

  async onClick(e: Event) {
    const continueFlag = await this.tab.beforeRemove(this.tab);
    if (continueFlag) {
      this.$emit("tabRemove", this.index);
    } else {
      console.error("tab removing has been blocked cause of beforeRemove hook");
    }
    // e.preventDefault();
    // return false;
  }
}
</script>

<style>
</style>