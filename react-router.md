<!--
 * @Description: In User Settings Edit
 * @Author: your name
 * @Date: 2019-09-19 10:38:58
 * @LastEditTime: 2019-09-19 13:38:28
 * @LastEditors: Please set LastEditors
 -->
# react-router原理

在构建react应用中少不了路由管理，社区通用的方案是`react-router`这个库,其声明式的路由管理受到了广泛的认可和使用。


### 基本用法

```
import React from "react";
import { BrowserRouter as Router, Route, Link } from "react-router-dom";

function Index() {
  return <h2>Home</h2>;
}

function About() {
  return <h2>About</h2>;
}

function Users() {
  return <h2>Users</h2>;
}

function AppRouter() {
  return (
    <Router>
      <div>
        <nav>
          <ul>
            <li>
              <Link to="/">Home</Link>
            </li>
            <li>
              <Link to="/about/">About</Link>
            </li>
            <li>
              <Link to="/users/">Users</Link>
            </li>
          </ul>
        </nav>

        <Route path="/" exact component={Index} />
        <Route path="/about/" component={About} />
        <Route path="/users/" component={Users} />
      </div>
    </Router>
  );
}

export default AppRouter;
```

通过这个实例可以看到我们引入了三个组件`Router`,`Route`,`Link`来实现路由的基本功能。其使用都是组件化的方式，只要传入对应的属性即可，非常的简单。


这里要说一下 react-router依赖history这个库来提供基本的路由管理功能，react-router只是将history的功能在react上进行了适配。


history 提供了三个不同方法来创建history对象

- createBrowserHistory使用HTML5 history API实现
- createMemoryHistory用于非DOM环境中，如React-native
- createHashHistory相对于createBrowserHistory兼容性更好

react-router也实现了三个对应的router组件，分别创建不同的history对象，关于history可以看[history源码](https://github.com/xiaoxiaosaohuo/Note/issues/33)

```
class MemoryRouter extends React.Component {
  history = createHistory(this.props);

  render() {
    return <Router history={this.history} children={this.props.children} />;
  }
}

class BrowserRouter extends React.Component {
  history = createHistory(this.props);

  render() {
    return <Router history={this.history} children={this.props.children} />;
  }
}
class HashRouter extends React.Component {
  history = createHistory(this.props);

  render() {
    return <Router history={this.history} children={this.props.children} />;
  }
}
```


### Router


```
import RouterContext from "./RouterContext";

class Router extends React.Component {
    // 计算根路由的匹配对象
  static computeRootMatch(pathname) {
    return { path: "/", url: "/", params: {}, isExact: pathname === "/" };
  }

  constructor(props) {
    super(props);
    // 将传入的history对象location属性存入state
    this.state = {
      location: props.history.location
    };

    // This is a bit of a hack. We have to start listening for location
    // changes here in the constructor in case there are any <Redirect>s
    // on the initial render. If there are, they will replace/push when
    // they mount and since cDM fires in children before parents, we may
    // get a new location before the <Router> is mounted.

    // 在constructor中监听location的变化是处理初始渲染时发生了redirect，如果发生了redirect，可能会在router组件mounted之前拿到一个新的loaction，因为children会早于父级组件mount
    this._isMounted = false;
    this._pendingLocation = null;

    if (!props.staticContext) {
      this.unlisten = props.history.listen(location => {
        if (this._isMounted) {
            // 监听location的变化，触发setState
          this.setState({ location });
        } else {
          this._pendingLocation = location;
        }
      });
    }
  }

  componentDidMount() {
    this._isMounted = true;

    if (this._pendingLocation) {
      this.setState({ location: this._pendingLocation });
    }
  }

  componentWillUnmount() {
    if (this.unlisten) this.unlisten();
  }

  render() {
    return (
      <RouterContext.Provider
        children={this.props.children || null}
        value={{
          history: this.props.history,
          location: this.state.location,
          match: Router.computeRootMatch(this.state.location.pathname),
          staticContext: this.props.staticContext
        }}
      />
    );
  }
}
```

Router的实现很简单，从其render方法可以看到返回了一个Provider，传入一系列的属性，由此可以想到如果要实现UI的变化那么Route其实是`RouterContext。Consumer`

Router对location的变化进行了监听，并进行setState，从而保证路由的变化能被所有的Route接收到，进行渲染。


### Route


```
class Route extends React.Component {
  render() {
    return (
      <RouterContext.Consumer>
        {context => {
          invariant(context, "You should not use <Route> outside a <Router>");

          const location = this.props.location || context.location;
          const match = this.props.computedMatch
            ? this.props.computedMatch 
            : this.props.path
              ? matchPath(location.pathname, this.props)
              : context.match;

          const props = { ...context, location, match };

          let { children, component, render } = this.props;

          // 如果children是空数组
          if (Array.isArray(children) && children.length === 0) {
            children = null;
          }

          if (typeof children === "function") {
            children = children(props);

            if (children === undefined) {
              
              children = null;
            }
          }

          return (
            <RouterContext.Provider value={props}>
              {children && !isEmptyChildren(children)
                ? children
                : props.match
                  ? component
                    ? React.createElement(component, props)
                    : render
                      ? render(props)
                      : null
                  : null}
            </RouterContext.Provider>
          );
        }}
      </RouterContext.Consumer>
    );
  }
}
```

Route组件返回了一个`RouterContext.Consumer`类型的组件，通过renderProps进行UI渲染

- 从context中取出location，计算是否和当前Route的path是否匹配，匹配时match是一个对象，否则是null
- 如果不匹配就会返回null
- 匹配就会判断是component还是render方法进行对应组件渲染


### Link

```
const Link = forwardRef(
  (
    { component = LinkAnchor, replace, to, innerRef, ...rest },
    forwardedRef
  ) => {
    return (
      <RouterContext.Consumer>
        {context => {

          const { history } = context;
            // 根据 context的location创建一个locaiton对象
          const location = normalizeToLocation(
            resolveToLocation(to, context.location),
            context.location
          );
            // 根据location和to属性创建一个href
          const href = location ? history.createHref(location) : "";

          return React.createElement(component, {
            ...rest,
            ref: forwardedRef || innerRef,
            href,
            navigate() {
                // 路径跳转方法，会传递给a标签
              const location = resolveToLocation(to, context.location);
              const method = replace ? history.replace : history.push;

              method(location);
            }
          });
        }}
      </RouterContext.Consumer>
    );
  }
);

// a标签跳转
const LinkAnchor = forwardRef(
  ({ innerRef, navigate, onClick, ...rest }, forwardedRef) => {
    const { target } = rest;

    return (
      <a
        {...rest}
        ref={forwardedRef || innerRef}
        // 点击事件处理，路由跳转
        onClick={event => {
          try {
            if (onClick) onClick(event);
          } catch (ex) {
            event.preventDefault();
            throw ex;
          }

          if (
            !event.defaultPrevented && 
            event.button === 0 && 
            (!target || target === "_self") && 
            !isModifiedEvent(event) 
          ) {
            event.preventDefault();
            navigate();
          }
        }}
      />
    );
  }
);
```

Link 组件就是a标签，非常简单



### Redirect

重定向组件

```
function Redirect({ computedMatch, to, push = false }) {
  return (
    <RouterContext.Consumer>
      {context => {
        const { history, staticContext } = context;

        const method = push ? history.push : history.replace;
        // 创建location
        const location = createLocation(
          computedMatch
            ? typeof to === "string"
              ? generatePath(to, computedMatch.params)
              : {
                  ...to,
                  pathname: generatePath(to.pathname, computedMatch.params)
                }
            : to
        );

        if (staticContext) {
          method(location);
          return null;
        }

        return (
          <Lifecycle
            onMount={() => {
              method(location);
            }}
            //re-render之后触发，判断是不是重定向到当前的route
            onUpdate={(self, prevProps) => {
              const prevLocation = createLocation(prevProps.to);
              if (
                !locationsAreEqual(prevLocation, {
                  ...location,
                  key: prevLocation.key
                })
              ) {
                method(location);
              }
            }}
            to={to}
          />
        );
      }}
    </RouterContext.Consumer>
  );
}
```


### Switch

```
class Switch extends React.Component {
  render() {
    return (
      <RouterContext.Consumer>
        {context => {

          const location = this.props.location || context.location;

          let element, match;
            // 这里使用 React.Children.forEach而不是React.Children.toArray是应为toArray会给每个child添加一个key,会导致unmount/remount

          React.Children.forEach(this.props.children, child => {
            if (match == null && React.isValidElement(child)) {
              element = child;

              const path = child.props.path || child.props.from;

              match = path
                ? matchPath(location.pathname, { ...child.props, path })
                : context.match;
            }
          });

          return match
            ? React.cloneElement(element, { location, computedMatch: match })
            : null;
        }}
      </RouterContext.Consumer>
    );
  }
}
```

Switch功能是渲染第一个匹配的路由组件。通过`React.Children.forEach`遍历，返回第一个匹配的component

### withRouter

```
function withRouter(Component) {
  const displayName = `withRouter(${Component.displayName || Component.name})`;
  const C = props => {
    const { wrappedComponentRef, ...remainingProps } = props;

    return (
      <RouterContext.Consumer>
        {context => {
          
          return (
            <Component
              {...remainingProps}
              {...context}
              ref={wrappedComponentRef}
            />
          );
        }}
      </RouterContext.Consumer>
    );
  };

  C.displayName = displayName;
  C.WrappedComponent = Component;

  return hoistStatics(C, Component);
}
```

withRouter 是一个高阶组件，可以通过withRouter高阶组件访问history对象的属性和最接近的<Route>的匹配，将最新的history和location等属性传递给被包装的组件



### compilePath和matchPath 

主要用于计算路径匹配和路径参数

```
import pathToRegexp from "path-to-regexp";

const cache = {};
const cacheLimit = 10000; // 缓存上限
let cacheCount = 0;

function compilePath(path, options) {
    // cacheKey 有8中组合 如truetruetrue falsefalsefalse;
  const cacheKey = `${options.end}${options.strict}${options.sensitive}`;
  const pathCache = cache[cacheKey] || (cache[cacheKey] = {});
    // 缓存存在就取缓存
  if (pathCache[path]) return pathCache[path];

  const keys = [];
  // 计算路径正则
  const regexp = pathToRegexp(path, keys, options);
  const result = { regexp, keys };

  if (cacheCount < cacheLimit) {
    pathCache[path] = result;
    cacheCount++;
  }

  return result;
}

// 根据pathname计算路径对象
function matchPath(pathname, options = {}) {
  if (typeof options === "string" || Array.isArray(options)) {
    options = { path: options };
  }

  const { path, exact = false, strict = false, sensitive = false } = options;

  const paths = [].concat(path);

  return paths.reduce((matched, path) => {
    if (!path) return null;
    if (matched) return matched;

    const { regexp, keys } = compilePath(path, {
      end: exact,
      strict,
      sensitive
    });
    const match = regexp.exec(pathname);

    if (!match) return null;

    const [url, ...values] = match;
    const isExact = pathname === url;
    // 需要精确匹配，但是未匹配时返回null
    if (exact && !isExact) return null;

    return {
      path, 
      url: path === "/" && url === "" ? "/" : url, 
      isExact, 
      params: keys.reduce((memo, key, index) => {
        memo[key.name] = values[index];
        return memo;
      }, {})
    };
  }, null);
}

export default matchPath;

```