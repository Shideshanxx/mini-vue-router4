<template>
  <div class="home">home</div>
  <router-link to="/a">a页面</router-link>
  |
  <router-link to="/b">b页面</router-link>
  <router-view />
</template>

<script>
import HelloWorld from "@/components/HelloWorld.vue";

export default {
  name: "Home",
  components: {
    HelloWorld,
  },
};
</script>
