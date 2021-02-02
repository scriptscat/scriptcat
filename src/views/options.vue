<template>
  <div id="app">
    {{ data }}
  </div>
</template>

<script lang="ts">
import { Vue, Prop } from "vue-property-decorator";

export default class App extends Vue {
  private data: string = "test";
}
</script>

<style>
#app {
  background: #000;
}
</style>
