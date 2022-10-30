import { createWebHashHistory } from "./history/hash";
import { createWebHistory } from "./history/html5";
import { shallowRef, computed, reactive, unref } from "vue";
import { RouterLink } from "./router-link";
import { RouterView } from "./router-view";
import { createRouterMatcher } from "./matcher";

// 初始化路由系统中的默认参数
const START_LOCATION_NORMALIZED = {
  path: "/",
  params: {}, // 路径参数
  query: {},
  matched: [], // 路径的匹配结果
};

function useCallback() {
  const handlers = [];
  function add(handler) {
    handlers.push(handler);
  }
  return {
    add,
    list: () => handlers,
  };
}

/**
 * 筛选出leavingRecords、updatingRecords、enteringRecords；以从 /a 进入 /b 为例：
 * 1. /a（即 from）的 matched 为 [Home, A]，/b（即 to）的 matched 为 [Home, B]，
 * 2. 经过下面的筛选后，updatingRecords为 [Home]、leavingRecords为 [A]、enteringRecords 为 [B]
 */
function extractChangeRecords(to, from) {
  const leavingRecords = [];
  const updatingRecords = [];
  const enteringRecords = [];
  const len = Math.max(to.matched.length, from.matched.length);
  for (let i = 0; i < len; i++) {
    // 一、离开的时候
    const recordFrom = from.matched[i];
    if (recordFrom) {
      // 1. 如果去的和来的都有，那么就是更新（比如从 '/' 到 '/'，就是更新）
      if (to.matched.find((record) => record.path === recordFrom.path)) {
        updatingRecords.push(recordFrom);
      } else {
        // 2. 否则就是离开
        leavingRecords.push(recordFrom);
      }
    }

    // 二、进入的时候
    const recordTo = to.matched[i];
    if (recordTo) {
      // 如果来的里面不含去的，就是进入
      if (!from.matched.find((record) => record.path === recordTo.path)) {
        enteringRecords.push(recordTo);
      }
    }
  }
  return [leavingRecords, updatingRecords, enteringRecords];
}
// 将guard封装成Promise
function guardToPromise(guard, to, from, record) {
  return () =>
    new Promise((resolve, reject) => {
      const next = () => resolve();
      // 绑定guard的this
      const guardReturn = guard.call(record, to, from, next);
      // 如果用户没有手动调用next，则返回一个新的Promise，并自动执行next
      return Promise.resolve(guardReturn).then(next);
    });
}
// 获取 guardType 对应的所有 guards
function extractComponentsGuards(matched, guardType, to, from) {
  const guards = [];
  for (const record of matched) {
    let rawComponent = record.components.default;
    const guard = rawComponent[guardType];
    guard && guards.push(guardToPromise(guard, to, from, record));
  }
  return guards;
}
// 通过 Promise 链式调用guards中所有的守卫钩子，并返回新的 Promise
function runGuardQueue(guards) {
  return guards.reduce(
    (promise, guard) => promise.then(() => guard()),
    Promise.resolve()
  );
}

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

  const beforeGuards = useCallback();
  const beforeResolveGuards = useCallback();
  const afterGuards = useCallback();

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
    if (from === START_LOCATION_NORMALIZED) {
      // 初始化时，注册listen事件【只注册一次】，用来监听popstate事件，状态改变时修改 currentRoute 以及进行页面跳转
      markAsReady();
    } else if (replaced) {
      routerHistory.replace(to.path);
    } else {
      routerHistory.push(to.path);
    }
    // 更新currentRoute
    currentRoute.value = to;
    console.log("currentRoute", currentRoute.value);
  }
  async function navigate(to, from) {
    // 在导航的时候，需要知道哪些组件是进入，哪些组件是离开，那些组件是更新
    const [leavingRecords, updatingRecords, enteringRecords] =
      extractChangeRecords(to, from);
    // guards 为 leavingRecords 中所有组件对应的 beforeRouteLeave 钩子组成的数组
    // 离开的时候需要先销毁子组件，再销毁父组件，所以需要将leavingRecords倒序
    let guards = extractComponentsGuards(
      leavingRecords.reverse(),
      "beforeRouteLeave",
      to,
      from
    );
    // 1. 执行组件内钩子 beforeRouteLeave
    return runGuardQueue(guards)
      .then(() => {
        // 2. 执行全局守卫 beforeEach
        guards = [];
        for (const guard of beforeGuards.list()) {
          guards.push(guardToPromise(guard, to, from, guard));
          return runGuardQueue(guards);
        }
      })
      .then(() => {
        // 3. 执行组件内钩子 beforeRouteUpdate
        guards = extractComponentsGuards(
          updatingRecords.reverse(),
          "beforeRouteUpdate",
          to,
          from
        );
        return runGuardQueue(guards);
      })
      .then(() => {
        // 4. 执行路由配置里的钩子 beforeEnter
        guards = [];
        for (const record of to.matched) {
          if (record.beforeEnter) {
            guards.push(guardToPromise(record.beforeEnter, to, from, record));
          }
        }
        return runGuardQueue(guards);
      })
      .then(() => {
        // 5. 执行组件内钩子 beforeRouteEnter
        guards = extractComponentsGuards(
          enteringRecords.reverse(),
          "beforeRouteEnter",
          to,
          from
        );
        return runGuardQueue(guards);
      })
      .then(() => {
        // 6. 执行全局守卫 beforeResolve
        guards = [];
        for (const guard of beforeResolveGuards.list()) {
          guards.push(guardToPromise(guard, to, from, guard));
          return runGuardQueue(guards);
        }
      });
  }
  // 通过路径匹配到对应的记录、页面跳转、更新currentRoute
  function pushWithRedirect(to) {
    const targetLocation = resolve(to);
    const from = currentRoute.value;
    // 导航守卫
    navigate(targetLocation, from)
      .then(() => {
        return finalizeNavigation(targetLocation, from);
      })
      .then(() => {
        // 7. 导航切换完毕后，执行 afterEach
        for (const guard of afterGuards.list()) {
          guard(to, from);
        }
      });
  }
  function push(to) {
    return pushWithRedirect(to);
  }

  const router = {
    push,
    // beforeEach、afterEach、beforeResolve可以注册多个，所以是发布订阅模式
    beforeEach: beforeGuards.add,
    afterEach: afterGuards.add,
    beforeResolve: beforeResolveGuards.add,
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
      app.component("RouterView", RouterView);

      if (currentRoute.value === START_LOCATION_NORMALIZED) {
        // 如果是初始化，需要通过路由系统先进行一次跳转，发生匹配
        push(routerHistory.location);
      }
    },
  };
  return router;
}

export { createWebHashHistory, createWebHistory, createRouter };
