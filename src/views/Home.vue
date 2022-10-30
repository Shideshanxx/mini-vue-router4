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
  beforeRouteEnter(to, from, next) {
    console.log("beforeRouteEnter", to);
  },
  beforeRouteUpdate(to, from, next) {
    console.log("beforeRouteUpdate", to);
  },
  beforeRouteLeave(to, from, next) {
    console.log("beforeRouteLeave", to);
  },
};
</script>
