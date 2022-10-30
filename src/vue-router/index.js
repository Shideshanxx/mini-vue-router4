import { createWebHashHistory } from "./history/hash";
import { createWebHistory } from "./history/html5";
import { shallowRef, computed, reactive, unref } from "vue";
import { RouterLink } from "./router-link";

/**
 * 创建record，格式化用户参数
 */
function normalizeRouteRecord(route) {
  const record = {
    path: route.path,
    meta: route.meta || {},
    beforeEnter: route.beforeEnter,
    name: route.name,
    // vue-router 中 route 也支持 components，所以合理设置components，default属性为 route.component
    components: {
      default: route.component,
    },
    children: route.children || [],
  };
  return record;
}

/**
 * 创建 matcher，并设置父子关系
 */
function createRouteRecordMatcher(record, parent) {
  const matcher = {
    path: record.path,
    record,
    // 1. 设置当前record的parent
    parent,
    children: [],
  };
  // 2. 给parent添加children
  if (parent) {
    parent.children.push(matcher);
  }
  return matcher;
}

/**
 * 创建目标数据格式：拍平、有父子关系
 */
function createRouterMatcher(routes) {
  const matchers = []; // 闭包
  function addRoute(route, parent) {
    let normalizedRecord = normalizeRouteRecord(route);
    if (parent) {
      normalizedRecord.path = parent.path + normalizedRecord.path;
    }
    // 创建 matcher，并设置父子关系
    const matcher = createRouteRecordMatcher(normalizedRecord, parent);
    // 递归处理children
    if ("children" in normalizedRecord) {
      let children = normalizedRecord.children;
      for (let i = 0; i < children.length; i++) {
        // 遍历 children 时的parent 就是 matcher
        addRoute(children[i], matcher);
      }
    }
    matchers.push(matcher);
  }
  routes.forEach((route) => addRoute(route));
  console.log("目标数据", matchers);

  /**
   * 根据用户跳转传入的to（如果是字符串，已经转化成了对象），获取到匹配的组件record（包括祖先组件的record）
   */
  function resolve(to) {
    const matched = [];
    let path = to.path;
    let matcher = matchers.find((m) => m.path === path);

    // 通过while循环，将path涉及到的所有组件全部放到matched中
    while (matcher) {
      matched.unshift(matcher.record);
      matcher = matcher.parent;
    }

    return {
      path,
      matched,
    };
  }

  return {
    // 动态添加路由【官方API的实现方式】
    addRoute,
    resolve,
  };
}

// 初始化路由系统中的默认参数
const START_LOCATION_NORMALIZED = {
  path: "/",
  params: {}, // 路径参数
  query: {},
  matched: [], // 路径的匹配结果
};

function createRouter(options) {
  /**
   * routerHistory 包含以下属性：
   * 1. routerHistory.location 代表当前路径
   * 2. routerHistory.state 代表当前状态
   * 3. routerHistory.listen 接受用户的回调，前进后退时可以触发此方法
   * 4. routerHistory.push/replace 路由跳转
   */
  const routerHistory = options.history;

  /**
   * 用户传递的路由格式是深层嵌套的，需要【格式化路由配置，给它拍平】
   * 当用户访问 /a 的时候，需要渲染其父组件 Home 以及 子组件A （对应两个 router-view 出口）
   */
  const matcher = createRouterMatcher(options.routes); // 格式化routes：拍平
  // 后续更新这个数据的value就可以更新视图了
  let currentRoute = shallowRef(START_LOCATION_NORMALIZED); // 使用 shallowRef 让 currentRoute.value 具备响应式
  // to 支持多种格式，可能是字符串，也可能是一个对象，
  function resolve(to) {
    if (typeof to === "string") {
      return matcher.resolve({ path: to });
    } else {
      return matcher.resolve(to);
    }
  }
  // 注入listen事件，监听前进、后退
  let ready;
  function markAsReady() {
    if (ready) return;
    ready = true;
    // 监听前进后退
    routerHistory.listen((to) => {
      const targetLocation = resolve(to);
      const from = currentRoute.value;
      // 传入第三个参数，即前进/后退时采用replace模式
      finalizeNavigation(targetLocation, from, true);
    });
  }
  // 初始化（注册listen事件）、页面跳转、状态更新
  function finalizeNavigation(to, from, replaced) {
    // 如果是初始化页面，或者浏览器的前进、后退
    if (from === START_LOCATION_NORMALIZED || replaced) {
      // 初始化时，注册listen事件【只注册一次】，用来监听popstate事件，状态改变时修改 currentRoute 以及进行页面跳转
      markAsReady();
    } else if (replaced) {
      routerHistory.replace(to.path);
    } else {
      routerHistory.push(to.path);
    }
    // 更新currentRoute
    currentRoute.value = to;
  }
  // 通过路径匹配到对应的记录、页面跳转、更新currentRoute
  function pushWithRedirect(to) {
    const targetLocation = resolve(to);
    const from = currentRoute.value;
    finalizeNavigation(targetLocation, from);
  }
  function push(to) {
    return pushWithRedirect(to);
  }

  const router = {
    push,
    replace() {},
    // 路由的核心：路由切换，重新渲染
    install(app) {
      const router = this;
      // 定义全局的 $router 和 $route
      app.config.globalProperties.$router = router;
      Object.defineProperty(app.config.globalProperties, "$route", {
        enumerable: true,
        get: () => unref(currentRoute),
      });

      // 注入 router 和 route location（ReactiveRoute）
      const ReactiveRoute = {};
      for (const key in START_LOCATION_NORMALIZED) {
        // 使用 computed 使 currentRoute.value 中的每一项具备响应式
        ReactiveRoute[key] = computed(() => currentRoute.value[key]);
      }
      app.provide("router", router); // 暴露router ——> useRouter 本质上就是 inject('router')
      // 经过computed处理后的数据需要通过 .value 属性进行取值。如果再使用reactive对ref数据进行包裹，则可以直接取值，而不需要通过 ReactiveRoute[key].value 的方式取值
      app.provide("route location", reactive(ReactiveRoute));

      // 注册全局组件 router-link
      app.component("RouterLink", RouterLink);
      // 注册全局组件 router-view
      app.component("RouterView", {
        setup: (props, { slots }) => {
          return () => <div>router-view</div>;
        },
      });

      if (currentRoute.value === START_LOCATION_NORMALIZED) {
        // 如果是初始化，需要通过路由系统先进行一次跳转，发生匹配
        push(routerHistory.location);
      }

      // TODO：解析路径；RouterLink、RouterView实现；页面的钩子；
    },
  };
  return router;
}

export { createWebHashHistory, createWebHistory, createRouter };
