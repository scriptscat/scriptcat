<template>
  <button @click="count++">{{ count }}</button>
</template>

<script>
export default {
  data() {
    return {
      count: 0,
    };
  },

  destroyed() {
    console.log(`test element has been destroyed with count ${this.count}`);
  },
};
</script>

<style>
</style>