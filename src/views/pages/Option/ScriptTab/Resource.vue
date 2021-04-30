<template>
  <div>
    cdn @require之类

    <template v-if="script.metadata">
      <v-card v-for="source in script.metadata.require" :key="source">
        {{ source }}
      </v-card>
    </template>
  </div>
</template>

<script lang="ts">
import { Component, Prop, Vue } from "vue-property-decorator";

@Component({})
export default class CloseButton extends Vue {}
</script>

<style>
</style>