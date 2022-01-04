<template>
  <v-carousel cycle height="200" hide-delimiter-background show-arrows-on-hover>
    <v-carousel-item v-for="(slide, i) in slides" :key="i">
      <v-sheet :color="colors[i]" height="100%">
        <v-row class="fill-height" align="center" justify="center">
          <div class="display-3">{{ slide }} Slide</div>

          <div
            :style="{
              width: '100px',
              height: '100px',
            }"
          >
            script cat logo
          </div>
          <div
            :style="{
              fontSize: '24px',
            }"
          >
            ScriptCat Next Generation Script Manager
          </div>
        </v-row>
        <!-- <div :style="{ display: 'grid', placeItems: 'center' }"> -->

        <!-- </div> -->
      </v-sheet>
    </v-carousel-item>
  </v-carousel>
</template>

<script lang="ts">
import { Vue, Component } from 'vue-property-decorator';

@Component({})
export default class Carousel extends Vue {
  colors = [
    'indigo',
    'warning',
    'pink darken-2',
    'red lighten-1',
    'deep-purple accent-4',
  ];
  slides = ['First', 'Second', 'Third', 'Fourth', 'Fifth'];
}
</script>