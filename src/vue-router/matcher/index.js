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
      normalizedRecord.path =
        parent.path + (parent.path === "/" ? "" : "/") + normalizedRecord.path;
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

export { createRouterMatcher };
