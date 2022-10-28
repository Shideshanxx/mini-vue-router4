import { createApp } from "vue";
import App from "./App.vue";
import router from "./router";

/**
 * use(router) 会调用 router.install(app)
 */
createApp(App).use(router).mount("#app");
