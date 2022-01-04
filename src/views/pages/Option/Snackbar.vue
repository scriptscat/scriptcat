<template>
  <v-snackbar v-model="snackbar" color="success" top right>
    {{ snackbarInfo }}

    <template v-slot:action="{ attrs }">
      <v-btn color="pink" text v-bind="attrs" @click="snackbar = false">
        关闭
      </v-btn>
    </template>
  </v-snackbar>
</template>

<script lang="ts">
import { Vue, Component } from 'vue-property-decorator';
import { scriptModule } from './store/script';

@Component({})
export default class Snackbar extends Vue {
  get snackbar() {
    return scriptModule.snackbar;
  }

  set snackbar(status: boolean) {
    scriptModule.updateSnackbarStatus(status);
  }

  get snackbarInfo() {
    return scriptModule.snackbarInfo;
  }
}
</script>