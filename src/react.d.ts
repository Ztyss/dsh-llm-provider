/**
 * react 的最小声明。
 *
 * 仓库里不装 @types/react：客户端插件只把 react 当动态对象用（`react.createElement` /
 * hooks 都是 any），装了反而会把宿主的 React 版本假设带进来。这里只声明模块存在。
 */
declare module 'react' {
  const react: any
  export default react
}
