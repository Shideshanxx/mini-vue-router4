## 前端路由
#### hash 模式
原理：修改 `window.location.hash` 改变路由的 `hash` 值，然后通过 `hashchange` 监听 `#` 后面的内容的变化来进行页面更新。
hash 模式的特点：
1. 改变 hash 值，浏览器不会重新加载页面
2. 当刷新页面时，hash 不会传给服务器

也就是说 `http://localhost/#a` 与 `http://localhost/` 这两个路由其实都是去请求 `http://localhost` 这个页面的内容，至于为什么它们可以渲染出不同的页面，这个是前端自己来判断的。所以 **hash 模式 不会产生 404 页面，也不能用于服务端渲染**。
#### history模式
原理：history 是基于 HTML5 新增的 `pushState(state,title,url)` 和 `replaceState(state,title,url)` 两个API修改历史栈，通过浏览器的 `popState` 事件监听历史栈的改变，然后进行页面更新。
特点是路径漂亮，没有锚点 `#`，修改 history 后刷新页面，会像服务器发送请求，如果资源不存在会出现404。
解决方案：在SPA应用中，在服务端永远只返回一个页面`index.html`，在前端根据路径（如果路径不存在时）重新跳转到404页面。

## 实现前端路由
目前浏览器都支持了 `history.pushState()`，可以使用该 API 实现两种路由模式。