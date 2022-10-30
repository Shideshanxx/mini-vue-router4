import {
  createRouter,
  createWebHistory,
  createWebHashHistory,
} from "@/vue-router";
import Home from "../views/Home.vue";
import About from "../views/About.vue";
import A from "../views/A.vue";
import C from "../views/C.vue";

const routes = [
  {
    path: "/",
    name: "Home",
    component: Home,
    children: [
      {
        path: "a",
        component: A,
        children: [
          {
            path: "c",
            component: C,
          },
        ],
      },
      {
        path: "b",
        component: { render: () => <h1>b页面</h1> },
      },
    ],
    beforeEnter(to, from, next) {
      console.log("beforeEnter", to);
    },
  },
  {
    path: "/about",
    name: "About",
    component: About,
  },
];

const router = createRouter({
  history: createWebHistory(process.env.BASE_URL),
  // history: createWebHashHistory(process.env.BASE_URL),
  routes,
});

router.beforeEach((to, from, next) => {
  console.log("beforeEach", to);
});
router.beforeResolve((to, from, next) => {
  console.log("beforeResolve", to);
});
router.afterEach((to, from, next) => {
  console.log("afterEach", to);
});

export default router;
