import { computed, h, inject, provide } from "vue";

export const RouterView = {
  name: "RouterView",
  setup(props, { slots }) {
    // 默认渲染injectRoute.matched数组中的第1个 record 对应的 components.default
    const depth = inject("depth", 0);
    const injectRoute = inject("route location");
    /**
     * 没点击 RouterLink 时，injectRoute.matched[depth] 是 undefined（相当于一个空标签），没有取到下一层匹配的 matcher
     * 所以 matchedRouteRef 必须是响应式的，当点击RouterLink、injectRoute.matched 改变后，injectRoute.matched[depth] 才能取到对应的值，再将 ViewRouter 渲染出来
     */
    const matchedRouteRef = computed(() => injectRoute.matched[depth]);
    provide("depth", depth + 1); // 在前一个的基础上加1

    return () => {
      const matchRoute = matchedRouteRef.value;
      const viewComponent = matchRoute && matchRoute.components.default;

      if (!viewComponent) {
        return slots.default && slots.default();
      }
      return h(viewComponent);
    };
  },
};
