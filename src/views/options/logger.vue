<template>
  <div>
    {{ log }}
  </div>
</template>

<script lang="ts">
import { Vue, Component } from "vue-property-decorator";

@Component({})
export default class App extends Vue {
  log: string = "123";
}
</script>
