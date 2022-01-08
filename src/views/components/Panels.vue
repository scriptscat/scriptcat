<template>
  <v-expansion-panels v-model="panel" multiple focusable>
    <v-expansion-panel v-for="(val, key) in configs" :key="key">
      <v-expansion-panel-header
        style="min-height: auto; font-size: 16px; font-weight: bold"
        >{{ key }}</v-expansion-panel-header
      >
      <v-expansion-panel-content>
        <div v-for="(val, key) in val.items" class="config-item" :key="key">
          <div v-if="val.type == 'select'">
            <div class="config-title">
              <span>{{ val.title }}:</span>
            </div>
            <div class="config-content">
              <v-select
                style="display: inline-block; width: 200px"
                v-model="val.value"
                :items="val.options"
                item-text="val"
                item-value="key"
                dense
                single-line
                @change="val.change(val)"
              >
              </v-select>
            </div>
          </div>
          <div v-else-if="val.type == 'check'">
            <div class="config-title">
              <input
                v-model="val.value"
                :id="val.title"
                @change="val.change(val)"
                type="checkbox"
              />
              <label :for="val.title" style="cursor: pointer">{{
                val.title
              }}</label>
            </div>
          </div>
          <div v-else-if="val.type == 'button'">
            <v-btn
              :color="val.color"
              @click="val.click(val)"
              :loading="val.loading"
              :disabled="val.disabled"
              style="color: #fff"
              small
              >{{ val.title }}</v-btn
            >
          </div>
          <div v-else-if="val.type == 'text'">
            <v-text-field
              v-model="val.value"
              @blur="val.change(val)"
              :label="val.title"
              :hint="val.describe"
            ></v-text-field>
          </div>
        </div>
      </v-expansion-panel-content>
    </v-expansion-panel>
  </v-expansion-panels>
</template>

<script lang="ts">
import { Vue, Component, Prop } from 'vue-property-decorator';

@Component({})
export default class Panels extends Vue {
  panel = [0, 1, 2, 3];

  @Prop()
  configs!: Panel.PanelConfigs;
}
</script>

<style scoped>
.config-item {
  margin-top: 10px;
  font-size: 14px;
}

.config-item .config-select {
  margin-top: 20px;
}

.config-item .config-title {
  display: inline-block;
  width: 200px;
}

.config-item .config-content {
  display: inline-block;
}
</style>
