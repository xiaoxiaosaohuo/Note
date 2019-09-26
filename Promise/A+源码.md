<!--
 * @Description: In User Settings Edit
 * @Author: your name
 * @Date: 2019-09-25 16:24:45
 * @LastEditTime: 2019-09-26 10:12:25
 * @LastEditors: Please set LastEditors
 -->
## Promise/A+源码分析


Promise相当于一个状态机，有三种状态

- pending
- fulfilled
- rejected

promise 对象初始化状态为 pending 2.当调用resolve(成功)，会由pending => fulfilled 3.当调用reject(失败)，会由pending => rejected

Promise/A+中也是这样实现的，但是多一个state。

- 0 - pending
- 1 - fulfilled with _value
- 2 - rejected with _value
- 3 - 当resolve一个promise的时候，state被置为3，一般是调用then方法之前该promise已经被resolve，且是一个promise时会发生


## 简单的工具方法

这几个方法主要是为了封装`try-catch` 
```
var LAST_ERROR = null;
var IS_ERROR = {};
function getThen(obj) {
  try {
    return obj.then;
  } catch (ex) {
    LAST_ERROR = ex;
    return IS_ERROR;
  }
}

function tryCallOne(fn, a) {
  try {
    return fn(a);
  } catch (ex) {
    LAST_ERROR = ex;
    return IS_ERROR;
  }
}
function tryCallTwo(fn, a, b) {
  try {
    fn(a, b);
  } catch (ex) {
    LAST_ERROR = ex;
    return IS_ERROR;
  }
}
```

## Promise 构造函数


```
function Promise(fn) {
  if (typeof this !== 'object') {
    throw new TypeError('Promises must be constructed via new');
  }
  if (typeof fn !== 'function') {
    throw new TypeError('Promise constructor\'s argument is not a function');
  }
  this._deferredState = 0;
  this._state = 0;
  this._value = null;
  this._deferreds = null;
  if (fn === noop) return;
  doResolve(fn, this);
}
```

属性解释
- _deferredState 延迟状态，0表示没有需要延迟处理的任务，1表示有一个任务，2表示有多个任务
- _state 见上面的关于状态转换的解释
- _deferreds延迟处理的任务队列，_deferredState为1时是一个对象，_deferredState为2时是一个数组


实例化Promise时需要执行回调函数`fn`，也就是执行器。

例如：
```
var promise1 = new Promise(function(resolve, reject) {
   setTimeout(()=>{
        resolve(1);
   },500)
  });
```

`fn` 将在`doResolve`方法中执行


## doResolve
```
function doResolve(fn, promise) {
  var done = false;
  var res = tryCallTwo(fn, function (value) {
    if (done) return;
    done = true;
    resolve(promise, value);
  }, function (reason) {
    if (done) return;
    done = true;
    reject(promise, reason);
  });
  if (!done && res === IS_ERROR) {
    done = true;
    reject(promise, LAST_ERROR);
  }
}
```

doResolve 方法功能

- 保证onFulfilled和 onRejected 只被调用一次，done变量做开关来控制
- 向Promise构造器的fn注入resovle和reject匿名函数
- 捕获执行器fn执行中的错误，有错的话直接reject


可以看到当在Promise实例化时调用resolve或者reject方法，最终会调用Promise中的resolve和reject方法并传入当前的promise实例


## resolve

```
function resolve(self, newValue) {
  if (newValue === self) {
    return reject(
      self,
      new TypeError('A promise cannot be resolved with itself.')
    );
  }
  if (
    newValue &&
    (typeof newValue === 'object' || typeof newValue === 'function')
  ) {
    var then = getThen(newValue);
    if (then === IS_ERROR) {
      return reject(self, LAST_ERROR);
    }
    if (
      then === self.then &&
      newValue instanceof Promise
    ) {
      self._state = 3;
      self._value = newValue;
      finale(self);
      return;
    } else if (typeof then === 'function') {
      doResolve(then.bind(newValue), self);
      return;
    }
  }
  self._state = 1;
  self._value = newValue;
  finale(self);
}
```

resolve处理逻辑

- 判断是否是循环引用
- 判断newValue是否是对象或者函数
    - 有then方法就取出then方法
    - 如果newValue是个promise,将state置为3，value置为newValue，调用finale处理，然后返回
    - 如果then是一个函数且有不是promise,继续调用doResolve处理
- 将state置为1，value置为newValue,调用finale处理



## reject

```
function reject(self, newValue) {
  self._state = 2;
  self._value = newValue;
  if (Promise._onReject) {
    Promise._onReject(self, newValue);
  }
  finale(self);
}
```

- 将state置为2
- 调用finale处理

## finale

```
function finale(self) {
  if (self._deferredState === 1) {
    handle(self, self._deferreds);
    self._deferreds = null;
  }
  if (self._deferredState === 2) {
    for (var i = 0; i < self._deferreds.length; i++) {
      handle(self, self._deferreds[i]);
    }
    self._deferreds = null;
  }
}
```
判断当前的promise的_deferredState，调用handle处理延迟队列，然后将该promise的_deferreds清空

## handle

处理延迟任务
```
function handle(self, deferred) {
  while (self._state === 3) {
    self = self._value;
  }
  if (Promise._onHandle) {
    Promise._onHandle(self);
  }
  if (self._state === 0) {
    if (self._deferredState === 0) {
      self._deferredState = 1;
      self._deferreds = deferred;
      return;
    }
    if (self._deferredState === 1) {
      self._deferredState = 2;
      self._deferreds = [self._deferreds, deferred];
      return;
    }
    self._deferreds.push(deferred);
    return;
  }
  handleResolved(self, deferred);
}
```
判断当前的promise状态进行不同的处理

- 如果为3，直接将当前的promise替换为新的promise `self = self._value`
- 如果为0，表明是pending，修改promise对延迟任务状态`deferredState`,更新延迟任务队列`_deferreds`

最后将延迟任务调用`handleResolved`进行异步调度，即放入微任务队列。


#### deferred是什么？

Promise原型上有then方法，该方法会返回一个promise。这个deferred是一个持有该promise的对象

```
Promise.prototype.then = function(onFulfilled, onRejected) {
  if (this.constructor !== Promise) {
    return safeThen(this, onFulfilled, onRejected);
  }
  var res = new Promise(noop);
  handle(this, new Handler(onFulfilled, onRejected, res));
  return res;
};

function Handler(onFulfilled, onRejected, promise){
  this.onFulfilled = typeof onFulfilled === 'function' ? onFulfilled : null;
  this.onRejected = typeof onRejected === 'function' ? onRejected : null;
  this.promise = promise;
}
```

可以看到then方法实例化一个Promise,并且实例化了一个Handler

Handler结构

- onFulfilled 不存在就为null
- onRejected 
- promise 

## handleResolved

```
function handleResolved(self, deferred) {
  asap(function() {
    var cb = self._state === 1 ? deferred.onFulfilled : deferred.onRejected;
    if (cb === null) {
      if (self._state === 1) {
        resolve(deferred.promise, self._value);
      } else {
        reject(deferred.promise, self._value);
      }
      return;
    }
    var ret = tryCallOne(cb, self._value);
    if (ret === IS_ERROR) {
      reject(deferred.promise, LAST_ERROR);
    } else {
      resolve(deferred.promise, ret);
    }
  });
}
```

调用`asap`方法将任务加入微任务队列，[Asap原理分析](https://github.com/xiaoxiaosaohuo/Note/issues/68)

当微任务队列的任务执行时，会判断该promise的状态决定调用resolve还是reject方法。在调用then方法时我们可能不会每次都传入两个回调函数，所以这里进行了判断处理

- 如果没有回调函数，调用promise的resolve或者reject方法处理，然后返回。

- 如果存在回调方法，调用你tryCallOne执行回调，且传入promise返回的value,所以我们的回调中可以接收到promise的返回值（包括reject的error)，执行完毕之后根据我们自定义回调函数的返回值继续调用resolve或者reject 。


从这里可以看出，上游一个promise的会影响延迟任务的promise的状态，因为resolve和reject都会修改promise的状态





## Promise.resolve

```
var TRUE = valuePromise(true);
var FALSE = valuePromise(false);
var NULL = valuePromise(null);
var UNDEFINED = valuePromise(undefined);
var ZERO = valuePromise(0);
var EMPTYSTRING = valuePromise('');

function valuePromise(value) {
  var p = new Promise(Promise._noop);
  p._state = 1;
  p._value = value;
  return p;
}

Promise.resolve = function (value) {
  if (value instanceof Promise) return value;

  if (value === null) return NULL;
  if (value === undefined) return UNDEFINED;
  if (value === true) return TRUE;
  if (value === false) return FALSE;
  if (value === 0) return ZERO;
  if (value === '') return EMPTYSTRING;

  if (typeof value === 'object' || typeof value === 'function') {
    try {
      var then = value.then;
      if (typeof then === 'function') {
        return new Promise(then.bind(value));
      }
    } catch (ex) {
      return new Promise(function (resolve, reject) {
        reject(ex);
      });
    }
  }
  return valuePromise(value);
};
```


`valuePromise`方法将非promise值转化为一个promise，返回一个fulfilled状态的promise实例

Promise.resolve 主要是用`valuePromise`将一个非promise值转化为一个promise，同时还处理了value是对象或者是函数的情况


## Promise.reject


```

Promise.reject = function (value) {
  return new Promise(function (resolve, reject) {
    reject(value);
  });
};
```
返回一个被reject的promise实例


## Promise.prototype.catch
```
Promise.prototype['catch'] = function (onRejected) {
  return this.then(null, onRejected);
};
```

## Promise.race

```
Promise.race = function (values) {
  return new Promise(function (resolve, reject) {
    values.forEach(function(value){
      Promise.resolve(value).then(resolve, reject);
    });
  });
};
```

这里利用了一个promise只能被resolve一次的特性

## Promise.all 


```
Promise.all = function (arr) {
  var args = Array.prototype.slice.call(arr);

  return new Promise(function (resolve, reject) {
    if (args.length === 0) return resolve([]);
    var remaining = args.length;
    function res(i, val) {
      if (val && (typeof val === 'object' || typeof val === 'function')) {
        if (val instanceof Promise && val.then === Promise.prototype.then) {
          while (val._state === 3) {
            val = val._value;
          }
          if (val._state === 1) return res(i, val._value);
          if (val._state === 2) reject(val._value);
          val.then(function (val) {
            res(i, val);
          }, reject);
          return;
        } else {
          var then = val.then;
          if (typeof then === 'function') {
            var p = new Promise(then.bind(val));
            p.then(function (val) {
              res(i, val);
            }, reject);
            return;
          }
        }
      }
      args[i] = val;
      if (--remaining === 0) {
        resolve(args);
      }
    }
    for (var i = 0; i < args.length; i++) {
      res(i, args[i]);
    }
  });
};
```

- 将传入的数组浅复制，返回一个Promise
- 使用for循环执行数组中的promise
- 每执行完一个promise将其返回结果存入args中
- 当全部执行完毕之后调用resolve修改promise的状态
- 当某一个promise被reject时调用最外层的reject方法将整个promise拒绝掉


## Promise.prototype.finally


```
Promise.prototype.finally = function (f) {
  return this.then(function (value) {
    return Promise.resolve(f()).then(function () {
      return value;
    });
  }, function (err) {
    return Promise.resolve(f()).then(function () {
      throw err;
    });
  });
};
```
finally() 方法返回一个Promise。在promise结束时，无论结果是fulfilled或者是rejected，都会执行指定的回调函数

finally() 虽然与 .then(onFinally, onFinally) 类似，它们不同的是：
- 由于无法知道promise的最终状态，所以finally的回调函数中不接收任何参数，它仅用于无论最终结果如何都要执行的情况。
- 与Promise.resolve(2).then(() => {}, () => {}) （resolved的结果为undefined）不同，Promise.resolve(2).finally(() => {}) resolved的结果为 2。
- 同样，Promise.reject(3).then(() => {}, () => {}) (resolved 的结果为undefined), Promise.reject(3).finally(() => {}) rejected 的结果为 3。