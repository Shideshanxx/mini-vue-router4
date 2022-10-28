import {
  createRouter,
  createWebHistory,
  createWebHashHistory,
} from "@/vue-router";
import Home from "../views/Home.vue";

const routes = [
  {
    path: "/",
    name: "Home",
    component: Home,
    children: [
      {
        path: "a",
        component: { render: () => <h1>a页面</h1> },
      },
      {
        path: "b",
        component: { render: () => <h1>b页面</h1> },
      },
    ],
  },
  {
    path: "/about",
    name: "About",
    component: () =>
      import(/* webpackChunkName: "about" */ "../views/About.vue"),
  },
];

const router = createRouter({
  history: createWebHistory(process.env.BASE_URL),
  // history: createWebHashHistory(process.env.BASE_URL),
  routes,
});

export default router;
