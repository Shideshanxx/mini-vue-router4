## 设计思路
### 什么是前端路由
在spa出现之前，页面的跳转(导航)都是通过服务端控制的，用户输入一个url，浏览器向服务端发起请求，服务端匹配映射表，找到对应的处理程序，返回对应的资源，跳转存在一个明显白屏跳转过程；
spa出现后，为了更好的体验，就没有再让服务端控制跳转了，前端路由出现了，前端可以自由控制组件的渲染，来模拟页面跳转。
要实现一个前端路由，需要三个部分
1. **路由映射表**：一个能表达url和组件关系的映射表，可以使用Map、对象字面量来实现
2. **匹配器**：负责在访问url时，进行匹配，找出对应的组件
3. **历史记录栈**：浏览器平台，已经原生支持，无需实现，直接调用接口

三者协作关系如下：
![router](https://p1-juejin.byteimg.com/tos-cn-i-k3u1fbpfcp/9000f156a42241bf97526a8bbcf87a49~tplv-k3u1fbpfcp-zoom-in-crop-mark:4536:0:0:0.awebp)
## 路由系统的实现
我们先脱离vue，来实现一套基础的路由系统，它包含的功能有：
+ 同时支持 history 模式和 hash 模式
+ 暴露两个路由跳转的 API：`push`、`replace`，路由跳转时修改导航信息和 `history` 记录。
+ 当点击浏览器的前进/后退按钮时，可以修改导航信息，并打印出对应的 `historyState`（包含上一个路由、下一个路由、当前路由、页面滚动位置等信息）
### history模式
原理：`history`模式是基于 HTML5 新增的 `pushState(state,title,url)` 和 `replaceState(state,title,url)` 两个 API 修改历史栈，通过浏览器的 `popState` 事件监听历史栈的改变，然后进行页面更新。
`history` 模式的特点：
1. 路径漂亮，没有锚点 `#`；
2. 修改 url，会向服务器发送请求，如果资源不存在会出现 404。解决方案：在SPA应用中，在服务端永远只返回一个页面 `index.html`，在前端根据路径（如果路径不存在时）重新跳转到 404 页面。

### hash 模式
原理：修改 `window.location.hash` 改变路由的 `hash` 值，然后通过 `hashchange` 监听 `#` 后面的内容的变化来进行页面更新。目前浏览器都支持了 `popstate`，也可以使用该 API 实现 `hash` 路由模式。
`hash` 模式的特点：
1. 改变 `hash` 值，浏览器不会重新加载页面
2. 当刷新页面时，hash 不会传给服务器

也就是说 `http://localhost/#a` 与 `http://localhost/` 这两个路由其实都是去请求 `http://localhost` 这个页面的内容，至于为什么它们可以渲染出不同的页面，这个是前端自己来判断的。所以 **hash 模式 不会产生 404，也不能用于服务端渲染**。

### 前置工具函数
1. 自定义路由状态state
```js
function buildState(
    back,
    current,
    forward,
    replace = false,
    computedScroll = false
) {
    return {
        back,
        current,
        forward,
        replace,
        // 缓存scroll之后，可以利用 window.scrollBy(pageXOffset, pageYOffset); 将页面滚动到原来的位置
        scroll: computedScroll
            ? { left: window.pageXOffset, top: window.pageYOffset }
            : null,
        position: window.history.length - 1,
    };
}
```
2. 获取当前路由路径
```js
// history模式下，base为''；hash模式下，base 为 '#'
function createCurrentLocation(base) {
    const { pathname, search, hash } = window.location;
    if (base.indexOf("#") > -1) {
        // 如果是hash路由，createCurrentLocation 返回 # 后面的部分
        return base.slice(1) || "/";
    }
    return pathname + hash + search;
}
const currentLocation = {
    value: createCurrentLocation(base),
};
```
3. 当前路由状态的初始化
```js
const historyState = {
    value: window.history.state,
};
```
4. 页面跳转并修改状态
```js
function changeLocation(to, state, replace = false) {
    const url = base.indexOf("#") > -1 ? base + to : to;
    // window.history.replaceState/pushState 传入的 state 会修改 window.history.state
    window.history[replace ? "replaceState" : "pushState"](
        state,
        null,
        url
    );
    // 手动修改 historyState（保存的是当前的state）
    historyState.value = state;
}
```
### 初始化state
当初始化页面时，可以使用`buildState`创建自定义的`state`，然后利用`replaceState`初始化`window.history.state`
```js
function createCurrentLocation(base) {
    const historyState = {
        value: window.history.state,
    };
    // 初始时 historyState.value 为 null
    if (!historyState.value) {
        changeLocation(
            currentLocation.value,
            // 通过build自定义state
            buildState(null, currentLocation.value, null, true),
            true
        );
    }
}
```
### push 的实现
1. 创建`currentState`：添加`scroll`、`forward`属性，并与当前的`historyState`合并。
1. 先执行`changeLocation(currentState.current, currentState, true)`，其中第三个参数传入`true`，即调用 `history.replaceState` 实现页面刷新和状态修改。目的是实现在vue中，通过监听状态改变，触发跳转前的路由钩子。
2. 然后修改 `state` 中的`position`、`scroll`，并与 `push` 传入的 `data` 合并生成新的 `state`；
3. 最后调用 `changeLocation` 执行 `history.pushState` 实现真正的页面跳转

```js
function push(to, data) {
    const currentState = Object.assign({}, historyState.value, {
        forward: to,
        scroll: { left: window.pageXOffset, top: window.pageYOffset },
    });
    /**
     * 下方location的第一个参数 to 为当前路径 currentState.current；第三个参数为 true，即使用 history.replaceState 替换掉当前路由；
     * 所以这里本质并没有跳转，【只是更新了当前状态】，方便后续在vue中可以详细监听到状态的变化
     * 这一步的目的是为了实现在将要跳转前，触发生命周期钩子
     */
    changeLocation(currentState.current, currentState, true);

    // 创建 history.pushState 需要传入的 state，并实现真正的跳转
    const state = Object.assign(
        {},
        buildState(currentLocation.value, to, null, false),
        { position: currentState.position + 1 },
        data
    );
    console.log("push跳转时传入的state", state);
    changeLocation(to, state, false); // 真正的跳转
    currentLocation.value = to; // 修改 currentLocation 变量，后续在listener中会用到
}
```
### replace 的实现
1. 通过 `buildState` 创建 `state`，并与 `replace` 传入的 `data` 合并生成新的 `state`
2. 通过 `changeLocation(to, state, true)` 执行 `history.replaceState` 实现页面替换和状态修改

```js
function replace(to, data) {
    // 创建 history.replaceState 需要传入的 state，并实现真正的跳转
    const state = Object.assign(
        {},
        buildState(
            historyState.value.back,
            to,
            historyState.value.forward,
            true
        ),
        data
    );
    console.log("replace跳转时传入的state", state);
    changeLocation(to, state, true); // 跳转并更新history的状态
    currentLocation.value = to;
}
```
### 监听浏览器的前进/后退
当 `history.state` 发生变化的时候，会触发 `popstate` 事件，执行其回调；
我们可以创建一个任务队列，当触发 `popstate` 事件时，执行所有的任务。
```js
function useHistoryListeners(base, historyState, currentLocation) {
    let listeners = [];
    // popstate 回调函数中的 state 是已经前进或后退完毕后的最新状态
    const popStateHandler = ({ state }) => {
        const to = createCurrentLocation(base);
        const from = currentLocation.value;
        const fromState = historyState.value;

        // 点击前进/后退按钮后，修改当前的路径和状态
        currentLocation.value = to;
        historyState.value = state; // state 可能为null

        let isBack = state.position - fromState.position < 0;
        // 监听到前进/后退，执行所有的listener
        listeners.forEach((listener) => {
            listener(to, from, { isBack });
        });
    };
    window.addEventListener("popstate", popStateHandler); // 监听浏览器的前进、后退
    function listen(cb) {
        listeners.push(cb);
    }
    return {
        listen,
    };
}

const routerHistory = createWebHashHistory();
routerHistory.listen((to, from, { isBack }) => {
    console.log(
        "to：",
        to,
        "         from：",
        from,
        "         是后退吗？",
        isBack
    );
});
```

### 实现 history 模式和hash模式
当调用 `createWebHistory` 创建路由时，可以传入`base`参数；`history` 模式时`base`值为 `''`；`hash` 模式时，`base` 值为 `#`。然后根据 `base` 参数，创建不同的 `location`、`url` 即可
```js
function createCurrentLocation(base) {
    const { pathname, search, hash } = window.location;
    if (base.indexOf("#") > -1) {
        // 如果是hash路由，createCurrentLocation 返回 # 后面的部分
        return base.slice(1) || "/";
    }
    return pathname + hash + search;
}
function changeLocation(to, state, replace = false) {
    const url = base.indexOf("#") > -1 ? base + to : to;
    window.history[replace ? "replaceState" : "pushState"](
        state,
        null,
        url
    );
    historyState.value = state;
}
```

### 完整代码
```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta http-equiv="X-UA-Compatible" content="IE=edge" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Document</title>
  </head>
  <body>
    <button onclick="routerHistory.push('/')">首页</button>
    <button onclick="routerHistory.push('/about')">关于</button>
    <button onclick="routerHistory.replace('/xxx')">替换当前路由</button>
    <script>
      /**
       * 1. 读取当前的路径
       * 2. 读取当前路径下的状态
       * 3. 切换路径的方法：push、replace
       * 4. 实现路由监听，如果路径变化，需要通知用户
       */
      function buildState(
        back,
        current,
        forward,
        replace = false,
        computedScroll = false
      ) {
        return {
          back,
          current,
          forward,
          replace,
          // 缓存scroll之后，可以利用 window.scrollBy(pageXOffset, pageYOffset); 将页面滚动到原来的位置
          scroll: computedScroll
            ? { left: window.pageXOffset, top: window.pageYOffset }
            : null,
          position: window.history.length - 1,
        };
      }

      function createCurrentLocation(base) {
        const { pathname, search, hash } = window.location;

        if (base.indexOf("#") > -1) {
          // 如果是hash路由，createCurrentLocation 返回 # 后面的部分
          return base.slice(1) || "/";
        }

        return pathname + hash + search;
      }

      function useHistoryStateNavgation(base) {
        // 路由路径
        const currentLocation = {
          value: createCurrentLocation(base),
        };
        // 路由状态
        const historyState = {
          value: window.history.state,
        };
        // 第一次打开页面，window.history.state 为 null，就自己维护一个状态(后退的路径、当前的路径、要去的路径、是push跳转还是repalce跳转、跳转后的滚动条位置)，并通过 history.replaceState 替换掉当前的状态
        if (!historyState.value) {
          changeLocation(
            currentLocation.value,
            buildState(null, currentLocation.value, null, true),
            true
          );
        }

        // 跳转并更新状态
        function changeLocation(to, state, replace = false) {
          const url = base.indexOf("#") > -1 ? base + to : to;

          // window.history.replaceState/pushState 传入的 state 会修改掉 window.history.state，但是 historyState.value 需要手动修改为 state
          window.history[replace ? "replaceState" : "pushState"](
            state,
            null,
            url
          );
          historyState.value = state;
        }
        function push(to, data) {
          const currentState = Object.assign({}, historyState.value, {
            forward: to,
            scroll: { left: window.pageXOffset, top: window.pageYOffset },
          });
          /**
           * 下方location的第一个参数 to 为 当前路径 currentState.current；第三个参数为 true，即使用 history.replaceState 替换掉当前路由；
           * 所以这里本质并没有跳转，【只是更新了当前状态】，后续在vue中我们可以详细监听到状态的变化
           * 这一步的目的是为了实现在将要跳转前，触发生命周期钩子
           */
          changeLocation(currentState.current, currentState, true);

          // 创建 history.pushState 需要传入的 state，并实现真正的跳转
          const state = Object.assign(
            {},
            buildState(currentLocation.value, to, null, false),
            { position: currentState.position + 1 },
            data
          );
          console.log("push跳转时传入的state", state);
          changeLocation(to, state, false); // 真正的跳转
          currentLocation.value = to;
        }
        function replace(to, data) {
          // 创建 history.replaceState 需要传入的 state，并实现真正的跳转
          const state = Object.assign(
            {},
            buildState(
              historyState.value.back,
              to,
              historyState.value.forward,
              true
            ),
            data
          );
          console.log("replace跳转时传入的state", state);
          changeLocation(to, state, true); // 跳转并更新history的状态
          currentLocation.value = to; // 替换后，需要将路径变为现在的路径
        }

        return {
          location: currentLocation,
          state: historyState,
          push,
          replace,
        };
      }

      // 前进、后退的时候，要更新 historyState 和 currentLocation
      function useHistoryListeners(base, historyState, currentLocation) {
        let listeners = [];
        // popstate 回调函数中的 state 是已经前进或后退完毕后的最新状态
        const popStateHandler = ({ state }) => {
          const to = createCurrentLocation(base);
          const from = currentLocation.value;
          const fromState = historyState.value;

          // 点击前进/后退按钮后，修改当前的路径和状态
          currentLocation.value = to;
          historyState.value = state; // state 可能为null

          let isBack = state.position - fromState.position < 0;
          // 监听到前进/后退，执行所有的listener
          listeners.forEach((listener) => {
            listener(to, from, { isBack });
          });
        };
        window.addEventListener("popstate", popStateHandler); // 监听浏览器的前进、后退
        function listen(cb) {
          listeners.push(cb);
        }
        return {
          listen,
        };
      }

      function createWebHistory(base = "") {
        const historyNavgation = useHistoryStateNavgation(base);
        const historyListeners = useHistoryListeners(
          base,
          historyNavgation.state,
          historyNavgation.location
        );
        const routerHistory = Object.assign(
          {},
          historyNavgation,
          historyListeners
        );

        Object.defineProperty(routerHistory, "location", {
          get: () => historyNavgation.location.value,
        });
        Object.defineProperty(routerHistory, "state", {
          get: () => historyNavgation.state.value,
        });
        return routerHistory;
      }

      function createWebHashHistory() {
        return createWebHistory("#");
      }

      // history 模式路由系统
      // const routerHistory = createWebHistory();

      // hash 模式路由系统
      const routerHistory = createWebHashHistory();

      routerHistory.listen((to, from, { isBack }) => {
        console.log(
          "to：",
          to,
          "         from：",
          from,
          "         是后退吗？",
          isBack
        );
      });
    </script>
  </body>
</html>
```
## vue-router4 基本结构
### vue-router 的使用
创建：
```js
import {
  createRouter,
  createWebHistory,
  createWebHashHistory,
} from "@/vue-router";
const routes = [
  {
    path: "/",
    name: "Home",
    component: ()=>import("../views/Home.vue"),
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
      import("../views/About.vue"),
  },
];
const router = createRouter({
  history: createWebHistory(process.env.BASE_URL),
  // history: createWebHashHistory(process.env.BASE_URL),
  routes,
});
export default router;
```
引入：
```js
import router from "./router";
createApp(App).use(router).mount("#app");
```
### 实现代码基本结构
在src目录下创建一个vue-router，即自己实现的vue-router，基本目录结构如下：
```
│  └─ vue-router
│     ├─ history
│     │  ├─ hash.js
│     │  └─ html5.js
│     └─ index.js
```
```js
// vue-router/history/html5.js
function useHistoryStateNavgation(base) {
    // ...略
}
function useHistoryListeners(base,historyState,currentLocation) {
    // ...略
}
export function createWebHistory(base = "") {
  const historyNavgation = useHistoryStateNavgation(base);
  const historyListeners = useHistoryListeners(
    base,
    historyNavgation.state,
    historyNavgation.location
  );
  const routerHistory = Object.assign({}, historyNavgation, historyListeners);
  // ...略
  return routerHistory;
}
```
```js
// vue-router/history/hash.js
import { createWebHistory } from "./html5";
export function createWebHashHistory() {
  return createWebHistory("#");
}
```
`vue-router` 使用 `createRouter` 创建路由，通过插件的形式引入到项目中。所以我们除了上文实现的`createWebHistory`和`createWebHashHistory`外，还要实现`createRouter`方法；
`createRouter` 返回一个`router`对象，其内部需要实现`install`方法，以及注册全局的 `RouterLink` 组件和 `RouterView` 组件：
```js
// vue-router/index.js
import { createWebHashHistory } from "./history/hash";
import { createWebHistory } from "./history/html5";
function createRouter(options) {
  const routerHistory = options.history;
  /**
   * 用户传递的路由格式是深层嵌套的，需要【格式化路由配置，给它拍平】
   * 当用户访问 /a 的时候，需要渲染其父组件 Home 以及 子组件A （对应两个 router-view 出口）
   */
  const matcher = createRouterMatcher(options.routes); // 格式化routes：拍平
  const router = {
    // 路由的核心：路由切换，重新渲染
    install: (app) => {
      console.log("安装路由");
      // 注册全局组件 router-link
      app.component("RouterLink", {
        setup: (props, { slots }) => {
          return () => <a>{slots.default && slots.default()}</a>;
        },
      });
      // 注册全局组件 router-view
      app.component("RouterView", {
        setup: (props, { slots }) => {
          return () => <div>router-view</div>;
        },
      });

      // TODO：解析路径；RouterLink、RouterView实现；页面的钩子；
    },
  };
  return router;
}
export { createWebHashHistory, createWebHistory, createRouter };
```

### createRouterMatcher
当我们访问 url 时，需要快速准确地匹配到组件；而用户传递进来的路由配置是深层嵌套的，我们需要给他拍平来符合我们的要求。
目标格式如下：
```js
matchers: [
    {
        children: [],
        parent: {
            children: [
                {path: '/a', record: {…}, parent: {…}, children: []},
                {path: '/b', record: {…}, parent: {…}, children: []}
            ],
            parent: undefined,
            path: '/',
            record: {
                beforeEnter: undefined,
                path: '',
                children: [
                    {path: 'a', component: {…}},
                    {path: 'b', component: {…}}
                ],
                components: {
                    default: {...}
                },
                meta: {},
                name: 'Home',
                path: '/'
            }
        },
        path: '/a',
        record: {
            beforeEnter: undefined,
            children: [],
            components: {default: {…}},
            meta: {},
            name: undefined,
            path: "/a"
        }
    },
    {path: '/b', record: {…}, parent: {…}, children: Array(0)},
    {path: '/', record: {…}, parent: undefined, children: Array(2)},
    {path: '/about', record: {…}, parent: undefined, children: Array(0)}
]
```
主要是将路由转化成一维数组，数组元素主要包含`path`（路径）、`record`（路由信息）、`parent`（父级路由）、`children`（子路由）等属性。

具体实现如下：
```js
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

  return {
    // 动态添加路由【官方API的实现方式】
    addRoute,
  };
}
```
## vue-router4 中的响应式原理
### 定义$router、$route 以及 注入全局的 router 和 ReactiveRoute
实现 `ReactiveRoute` 响应式的目的：
1. 每次修改 `currentRoute` 时，`ReactiveRoute` 都能响应式更新
2. 在 `RouterView` 组件中，当路由变化时，获取到响应式的`ReactiveRoute.matched`

为了保证注入到全局的 `ReactiveRoute` 经过解构的每一属性都具有响应式，实现步骤：
1. 先使用 `shallowRef` 处理 `START_LOCATION_NORMALIZED`，处理结果为 `currentRoute`。
2. 然后遍历 `currentRoute.value`，使用 `computed` 处理每一个属性，使每个属性具有响应式，然后将每个属性都赋值给 `ReactiveRoute` 对象。但是还有一个缺点就是取 `ReactiveRoute` 属性值的时候，需要增加一个 `.value`
3. 最后使用 `reactive` 处理 `ReactiveRoute`，目的是为了在取 `ReactiveRoute` 属性值的时候不需要通过 `.value` 获取

不直接使用 `reactive` 处理 `START_LOCATION_NORMALIZED` 的原因是使用 `reactive` 处理的对象，解构后的属性不具有响应式。
```js
// 初始化路由系统中的默认参数
const START_LOCATION_NORMALIZED = {
  path: "/",
  params: {}, // 路径参数
  query: {},
  matched: [], // 路径的匹配结果
};
function createRouter(options) {
  let currentRoute = shallowRef(START_LOCATION_NORMALIZED);
  const router = {
    push,
    replace,
    install(app) {
      const router = this;  // this指向router
      // 1. 定义全局的 $router 和 $route
      app.config.globalProperties.$router = router;
      Object.defineProperty(app.config.globalProperties, "$route", {
        enumerable: true,
        get: () => unref(currentRoute),
      });

      // 2. 注入 router 和 ReactiveRoute
      const ReactiveRoute = {};
      for (const key in START_LOCATION_NORMALIZED) {
        // 使用 computed 使 currentRoute.value 中的每一项具备响应式
        ReactiveRoute[key] = computed(() => currentRoute.value[key]);
      }
      app.provide("router", router); // 暴露router ——> useRouter 本质上就是 inject('router')
      // 经过computed处理后的数据需要通过 .value 属性进行取值。如果再使用reactive对ref数据进行包裹，则可以直接取值，而不需要通过 ReactiveRoute[key].value 的方式取值
      app.provide("route location", reactive(ReactiveRoute));
    }
  }
}
```

### 初始化 currentRoute、实现push、注册listen事件
初始化 `currentRoute`：
1. 初始状态为 `let currentRoute = shallowRef(START_LOCATION_NORMALIZED);`，所以当两者相等时即为页面初始化；
2. 当页面初始化时，注册`listen`事件监听浏览器的前进后退，以及初始化 `currentRoute`
3. 初始化 `currentRoute` 的值通过 `matcher.resolve({ path: to })` 获取，本质是在 `matchers` 中寻找到 `path` 对应的 `record`，然后使用 `while` 循环将它所有的组件 `recode` 全部获取到，合成一个数组。

`push` 的实现：
1. 通过 `matcher.resolve({ path: to })` 获取到目标路径的 `matched` 和 `path`，赋值为 `targetLocation`
2. 更新 `currentRoute`，赋值为 `targetLocation`
3. 通过 `routerHistory.push(to.path);` 进行页面跳转

注册`listen`，监听浏览器的前进、后退：
1. 当页面初始化时注册 `listen` 事件，通过标识符确保只会注册一次；
2. 本质是通过 `routerHistory.listen();` 进行注册，即监听 `popState` 事件，当状态改变时，就会遍历 `listeners` 数组，执行所有的 `listen` 回调。
3. 在回调中通过 `matcher.resolve({ path: to })` 获取到目标路径的 `matched` 和 `path`；再读取到当前的 `currentRoute`；最后通过 `routerHistory.replace(to.path);` 进行页面跳转。

具体实现如下：
```js
function createRouterMatcher(routes) {
  // ...略

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
    addRoute,
    resolve,
  };
}
function createRouter(options) {
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
  function pushWithRedirect(to) {
    // 根据 matcher 匹配到对应的 record
    const targetLocation = resolve(to);
    const from = currentRoute.value;
    finalizeNavigation(targetLocation, from);
  }
  function push(to) {
    return pushWithRedirect(to);
  }
  const router = {
    push,
    install(app) {
      // 如果是初始化，需要通过路由系统先进行一次跳转，发生匹配
      if (currentRoute.value === START_LOCATION_NORMALIZED) {
        push(routerHistory.location);
      }
    }
  }
}
```

## RouterLink 的实现
简单来说就是使用 `app.component()` 注册一个全局组件，在该组件中渲染出 `slots.default`，以及绑定一个点击事件；在点击事件中执行 `router.push()` 方法进行页面跳转。
```js
// vue-router/index.js
import { RouterLink } from "./router-link";
function createRouter(options) {
  const router = {
    push,
    replace,
    install(app) {
      // 注册全局组件 router-link
      app.component("RouterLink", RouterLink);
    }
  }
}
```
```js
// vue-router/router-link.js
import { h, inject } from "vue";
function useLink(props) {
  const router = inject("router");
  function navigate() {
    router.push(props.to);
  }
  return { navigate };
}
export const RouterLink = {
  name: "RouterLink",
  props: {
    to: {
      type: [String, Object],
      required: true,
    },
  },
  setup(props, { slots }) {
    const link = useLink(props);
    return () => {
      return h(
        "a",
        {
          onclick: link.navigate,
          style: { cursor: "pointer" },
        },
        slots.default && slots.default()
      );
    };
  },
};
```

## RouterView 的实现
步骤：
1. 通过 `inject("route location")` 可以注入响应式的 `ReactiveRoute`，里面包含经过路由匹配到的所有 `matcher.record`（数组格式，`parent`在前、`children`在后）
2. 目标是：在对应的 `RouterView` 组件渲染出对应位置的 `record.components.default`
   1. 通过 `inject` 注入父级 `RouterView` 组件传入的 `depth`
   2. `depth` 初始值为0，即 根`RouterView` 组件渲染 `matched` 的第一个元素，然后将 `depth` 加1，通过 `provide` 传递给下一个`RouterView` 组件
3. 通过响应式获取路由对应的`matched`，配合`inject`、`provide`传递`depth`的方式，实现 `RouterView` 能准确渲染出`matched`对应位置的组件

注意：`injectRoute.matched[depth]` 必须通过 `computed` 设为响应式
+ 当没点击 `RouterLink` 前，`injectRoute.matched[depth]` 是 `undefined`（`RouterView`相当于一个空标签，起到占位的作用）
+ 点击`RouterLink`、`injectRoute.matched` 改变后，`injectRoute.matched[depth]` 才能取到对应的值
+ 只有当 `injectRoute.matched[depth]` 是响应式的，才能在点击 `RouterLink` 、改变它的值之后，触发 `ViewRouter` 的重新渲染。

具体实现：
```js
// vue-router/index.js
import { RouterView } from "./router-view";
function createRouter(options) {
  const router = {
    push,
    replace,
    install(app) {
      // 注册全局组件 router-view
      app.component("RouterView", RouterView);
    }
  }
}
```
```js
import { computed, h, inject, provide } from "vue";
export const RouterView = {
  name: "RouterView",
  setup(props, { slots }) {
    // 默认渲染injectRoute.matched数组中的第1个 record 对应的 components.default
    const depth = inject("depth", 0);
    const injectRoute = inject("route location");
    /**
     * 没点击 RouterLink 前，injectRoute.matched[depth] 是 undefined（相当于一个空标签），没有取到下一层匹配的 matcher
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
```

## 路由导航守卫的实现
