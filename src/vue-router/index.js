import { createWebHashHistory } from "./history/hash";
import { createWebHistory } from "./history/html5";

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
