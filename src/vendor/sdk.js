'use strict';

import uniqID from 'uniq-id'
import defer from 'mini-defer'

const UA = navigator.userAgent
export const isAndroid = !!UA.match(/(Android);?[\s\/]+([\d.]+)?/)
export const isIPad = !!UA.match(/(iPad).*OS\s([\d_]+)/)
export const isIPhone = !isIPad && !!UA.match(/(iPhone\sOS)\s([\d_]+)/)
export const isMobile = isAndroid || isIPhone || isIPad
export const isPC = !isMobile

// let HB_HOST = 'https://app.huoban.com'
let HB_HOST = '*'

const MSG_TYPES = {
  CONNECT: '$connect$',
  DISCONNECT: '$disconnect$',
  CLOSE: '$close$',
  PING: '$ping$',
  BROADCAST: 'broadcast'
}

const delay = function(fn, ms) {
  return setTimeout(fn, ms || 0)
}

const toString = Object.prototype.toString

const isArray = function(value) {
  return Array.isArray ? Array.isArray(value) : toString.call(value) === '[object Array]'
}
const isObject = function(value) {
  return toString.call(value) === '[object Object]'
}
const isBool = function(value) {
  return toString.call(value) === '[object Boolean]'
}
const isString = function(value) {
  return toString.call(value) === '[object String]'
}

export const cvFiltersToV1 = function(filters) {
  let ops = Object.keys(filters)
  let newFilters = {}

  ops.forEach(op => {
    if (isObject(filters[op])) {
      newFilters[op] = cvFiltersToV1(filters[op])
    } else if (isArray(filters[op])) {
      newFilters[op] = filters[op].map(_cvFilterToV1)
    }
  })

  // console.log('cvFiltersToV1', filters, newFilters)

  return newFilters
}

export const cvFiltersToV2 = function(filters) {
  let ops = Object.keys(filters)
  let newFilters = {}

  ops.forEach(op => {
    if (isObject(filters[op])) {
      newFilters[op] = cvFiltersToV2(filters[op])
    } else if (isArray(filters[op])) {
      newFilters[op] = filters[op].map(_cvFilterToV2)
    }
  })

  // console.log('cvFiltersToV2', filters, newFilters)

  return newFilters
}

function _cvFilterToV1(filter) {
  let nf = {key: filter.field || filter.key}

  if (!filter.query) {
    filter.query = {}
  }

  if (filter.key == 'created_by') {
    nf.values = filter.query.in
  } else if (filter.key == 'create_on') {
    nf.values = {...filter.query}
  } else {
    if (isArray(filter.query.in)) {
      if (isString(filter.query.in[0]) && filter.query.in[0] != 'myself') {
        nf.keywords = filter.query.in
      } else {
        nf.values = filter.query.in
      }
    } else {
      nf.values = {...filter.query}
    }
    if (isBool(filter.query.em)) {
      nf.is_set = !filter.query.em
    }
    if (filter.query.in_field) {
      nf.fields = filter.query.in_field
    }
  }

  return nf
}
function _cvFilterToV2(filter) {
  let nf = {field: filter.key, query: {}}

  if (filter.key == 'created_by') {
    nf.query.in = filter.values
  } else if (filter.key == 'create_on') {
    nf.query = {...filter.values}
  } else {
    if (isObject(filter.values)) {
      nf.query = {...filter.values}
    } else if (isArray(filter.values)) {
      nf.query.in = filter.values
    }
    if (filter.keywords && isArray(filter.keywords) && filter.keywords.length) {
      nf.query.in = filter.keywords
    }
    if (filter.is_set === true || filter.is_set === false) {
      nf.query.em = !filter.is_set
    }
    if (filter.fields) {
      nf.query.in_field = filter.fields
    }
  }

  return nf
}

class Channel {
  constructor(handlers) {
    this.connect = defer()

    // promise 暂存
    this.promises = {}
    this.handlers = {}

    if (handlers) {
      this.on(handlers)
    }
  }

  /**
   * 注册连接成功后的回调
   * @param  {Function} fn 回调方法
   * @return {Channel}
   */
  ready(fn) {
    this.connect.promise.then(fn)
    return this
  }

  /**
   * 绑定事件监听
   * @param  {String}   action  事件名称
   * @param  {Function} fn      事件的回调
   * @param  {Boolean}  replace 是否覆盖已有回调
   */
  on(action, fn, replace) {
    let revokes
    if (!fn && typeof action == 'object') {
      revokes = []
      Object.keys(action).forEach(key => {
        revokes.push(this._on(key, action[key], replace))
      })
    } else {
      revokes = [this._on(action, fn, replace)]
    }

    return {
      on: this.on.bind(this),
      revoke: revokes[0],
      revokes: revokes
    }
  }

  _on(action, fn, replace) {
    let revoke = function() {}
    if (action && fn) {
      if (replace || !this.handlers[action]) {
        this.handlers[action] = []
      }
      this.handlers[action].push(fn)
      revoke = () => {
        this.off(action, fn)
      }
    }

    return revoke
  }

  /**
   * 解绑事件回调
   * @param  {String}   action 事件名称
   * @param  {Function} fn     回调方法
   */
  off(action, fn) {
    if (action && this.handlers[action]) {
      if (fn) {
        let idx = this.handlers[action].indexOf(fn)
        if (idx >= 0) {
          this.handlers[action].splice(idx, 1)
        }
      } else {
        this.handlers[action] = []
      }
    } else if (action == '!') {
      this.handlers = {}
    }

    return this
  }

  emit(action, data, responder) {
    // if (isAndroid) {
    //   alert('emit:' + action +'\n|href:'+location.href)
    // }
    let ret = []
    let halted = false
    if (action && this.handlers[action]) {
      let handlers = this.handlers[action]
      ret = handlers.map(fn => {
        let _ret
        if (!halted) {
          _ret = fn(data, responder)
          if (false === _ret) {
            halted = true
          }
        }
        return _ret
      })
    }

    if (action != '*' && this.handlers['*']) {
      ret = ret.concat(this.handlers['*'].map(fn => fn(action, data)))
    }

    return ret
  }

  /**
   * 给应用推送事件
   * @param  {String} action 事件名称
   * @param  {Object} data   推送的数据
   */
  push(action, data = null) {
    this.ready(() => {
      // console.log('channel.push', action, data)
      this._send(action, data)
    })
  }

  /**
   * 给应用发送事件
   * @param  {String}   action 事件名称
   * @param  {Object}   data   发送的数据
   * @param  {String}   _id    请求的id
   * @param  {Function} fn     请求的回调
   * @return {Promise|String}  返回Promise或请求的id
   */
  send(action, data, _id, fn) {
    let id = _id || this._unique_id()

    this.ready(() => {
      // console.log('channel.send', action, data, id)
      this._send(action, data, id)
    })

    if (fn && typeof fn == 'function') {
      // 这里使用覆盖式回调，避免多次调用引起的重复回调
      this.on(`${action}.callback`, fn, true)
      this.promises[id] = fn
      return id
    } else {
      let deferred = defer()
      this.promises[id] = deferred

      return deferred.promise
    }
  }

  handleMessage(e) {
    if (false === this._processMessage(e)) {
      return
    }

    let eData, id, action, data
    try {
      eData = e.data
      if (typeof eData == 'string') {
        if (isIPhone || isIPad) {
          // iOS生成的JSON字符串可能包含换行引起解析失败
          eData = eData.replace(/[\r\n]/g, '')
        }
        eData = JSON.parse(eData)
      }
      if (!eData.action && !eData.id && !eData.callback) throw new Error()
    } catch (err) {
      throw new Error('HB_APP_SDK: malformed message')
    }

    id = eData.id || eData.callback
    action = eData.action
    data = eData.params || eData.data

    if (id) {
      if (id in this.promises) {
        let promise = this.promises[id]
        // promise maybe an instance of Promise or a function
        if (promise.resolve) {
          if (eData.error) {
            promise.reject(eData.error)
          } else if (eData.result) {
            promise.resolve(eData.result)
          } else {
            promise.reject({cancelled: true})
          }
          this.promises[id] = null
        } else {
          if (eData.result || eData.error) {
            this.promises[id](eData.result, eData.error)
          } else {
            this.promises[id](null, {cancelled: true})
          }
        }
      } else if (action && this.handlers[action]) {
        let responder = (ret) => {
          this.send(action, ret, id)
        }
        this.emit(action, data, responder)
      }
    } else if (action) {
      // 针对一些事件(如广播)的特殊处理，方便应用使用 .on('broadcast.refresh', fn) 订阅指定广播事件
      this.emit(action, data)
      if (data && data.action) {
        this.emit(`${action}.${data.action}`, data.data)
      }
    } else {
      this.emit('*', data)
    }
  }

  destroy() {
    this.off('!')
    this.connect = defer()
  }

  _send() {}

  _processMessage(e) {
    return e
  }

  _unique_id(prefix = 'cb_', length = 10, decimal = 16) {
    let x64 = 'xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx'

    return uniqID.generateUUID(prefix + x64.substr(0, length), decimal)()
  }
}

class Client extends Channel {
  constructor(handlers) {
    super(handlers)
    // 业务数据
    this._ticket = null
    this._user = null
    this._table = null
    this._version = null
  }

  /**
   * 初始化应用
   * 鉴权+发放ticket
   *
   * @param  {Integer} application_id 应用/扩展的id
   * @return {Promise}
   *         .then({ticket, user, app, version}) resolve时返回：票据、当前登录用户、当前表格、客户端版本()
   *         .catch({code, message})
   */
  init(applicationId) {
    return defer().promise
  }

  /**
   * 新窗口打开指定链接
   * @param  {String} url   新窗口打开的链接地址
   * @param  {String} title 新窗口的标题
   */
  openWebPage(url, title) {
    this.push('openWebPage', {url, title})
  }

  /**
   * 关闭当前链接
   * (只对在新窗口中开启的应用有效)
   */
  closeWebPage() {
    this.push('closeWebPage')
  }

  /**
   * 设置页面标题(只对部分页面有效)
   * @param {String} title 标题
   */
  setTitle(title) {
    this.push('setTitle', {title})
  }

  /**
   * 设置导航栏显隐
   * @param {Boolean} isVisible 显示/隐藏
   */
  setNavigationBarVisibility(isVisible = false) {
    this.push('setNavigationBarVisibility', {is_visible: isVisible})
  }

  /**
   * 设置工具栏显隐
   * @param {Boolean} isVisible 显示/隐藏
   */
  setBottomToolBarVisibility(isVisible = false) {
    this.push('setBottomToolBarVisibility', {is_visible: isVisible})
  }

  /**
   * 广播事件
   * @param  {String} action 事件名称
   * @param  {Object} data   相关数据
   */
  broadcast(action, data) {
    this.push(MSG_TYPES.BROADCAST, data ? {action, data} : {action})
  }

  /**
   * 打开用户详情页
   * @param  {Integer} userId 用户ID
   * @param  {Object}  opts   配置参数
   *                   opts.placement {String}  [web only] 选择器的位置,可选: left-bottom/right-bottom/left-top/right-top/bottom, 默认值: bottom
   */
  openUserProfile(userId, opts = {}, _event) {
    let defaultOptions = {
      placement: 'bottom'
    }
    opts = {...defaultOptions, ...opts, user_id: userId}

    if (_event && isPC) {
      opts.ePos = this._getEventPosition(_event)
    }

    this.push('openUserProfile', opts)
  }

  /**
   * 获取指定表格信息
   * @param  {Integer} tableId 表格id
   * @return {Promise}
   *         .then({app_id: 123, name: xx, ..})
   *         .catch(err)
   */
  getTableData(tableId) {
    return this.send('getTableData', {table_id: tableId})
  }

  /**
   * 获取表格信息(getTableData的别名)
   */
  getAppData(tableId) {
    return this.getTableData(tableId)
  }

  /**
   * 获取工作区成员列表
   * @param  {Object} opts 特殊参数
   *                  opts.keyword {String} 搜索关键字
   * @return {Promise}
   */
  getSpaceMembers(opts = {}) {
    return this.send('getSpaceMembers', opts)
  }

  /**
   * 打开筛选器
   * @param  {Object}   app     表格信息
   * @param  {Object}   filters 筛选数据
   * @param  {Integer}  viewId  视图ID
   * @param  {Function} fn      筛选器发生变化时的回调函数
   */
  openFilter(app, filters, viewId, fn, _event) {
    let params = {
      table_id: app.app_id || app.table_id,
      space_id: app.space_id
    }
    if (filters) {
      params.filters = cvFiltersToV1(filters)
    }
    if (viewId) {
      if (typeof viewId == 'function') {
        fn = viewId
      } else if (viewId > 0) {
        params.viewId = parseInt(viewId)
      }
    }

    // 筛选器格式转换
    let _fn
    if (fn) {
      _fn = (data) => {
        if (data.filters) {
          data.filters = cvFiltersToV2(data.filters)
        }
        fn(data)
      }
    }

    if (_event && isPC) {
      params.ePos = this._getEventPosition(_event)
    }

    return this.send('openFilter', params, null, _fn)
  }

  /**
   * 打开diff展示组件
   * @param  {Integer} itemId    数据id
   * @param  {Integer} fromRevId 旧版本id
   * @param  {Integer} toRevId   新版本id
   * @param  {Object}  opts      其他参数
   *                   opts.field_id      {Integer} 指定展示的字段
   *                   opts.field_name    {String}  指定字段名称
   *                   opts.created_by_id {Integer} 更新者的用户id
   *                   opts.created_by    {Object}  更新者的用户对象
   *                   opts.updated_on    {String}  更新时间
   */
  openItemDiff(itemId, fromRevId, toRevId, opts = {}) {
    let params = {...opts, item_id: parseInt(itemId), from_revision_id: parseInt(fromRevId), to_revision_id: parseInt(toRevId), field_id: parseInt(opts.field_id)}
    if (params.field_id && !params.field_name && this._table) {
      this._table.fields.forEach(f => {
        if (f.field_id == params.field_id) {
          params.field_name = f.name
          return false
        }
      })
    }

    this.push('openItemDiff', params)
  }

  /**
   * 打开用户选择组件
   * @param  {Object}   opts 参数
   *                    opts.multi     {Integer} 是否多选
   *                    opts.required  {Boolean} 是否必选
   *                    opts.values    {Array}   默认选中的用户id: [11001, 11003]
   *                    opts.title     {String}  选择器的标题,默认: 选择成员
   *                    opts.placement {String}  [web only] 选择器的位置,可选: left-bottom/right-bottom/left-top/right-top, 默认值: right-bottom
   *                    opts.width     {Integer} [web only] 选择器的宽度，默认: 300
   * @param  {Function} fn   回调方法, fn(data, error)
   *                    data 为成功时的数据: {users: [{user_id: 11001, name: 'test1'}, {user_id: 11003, name: 'test2'}, ...]}
   *                    error 为出错时的具体错误, 如: {calcelled: true} 代表用户取消了选择, 或: {message: '默认值不存在'} 代表具体信息
   * @param  {Element}  _event 内部参数，代表触发的DOM事件
   */
  openUserPicker(opts = {}, fn, _event) {
    let defaultOptions = {
      multi: false,
      required: false,
      title: '选择成员',
      placement: 'right-bottom',
      width: 300
    }
    opts = {...defaultOptions, ...opts}
    if (_event && isPC) {
      opts.ePos = this._getEventPosition(_event)
    }

    return this.send('openUserPicker', opts, null, fn)
  }

  /**
   * 打开日期筛选器
   * @param  {Object}   opts 参数
   *                    opts.type      {String}  选择器类型，date/time/datetime
   *                    opts.value     {String}  初始值: '2016-06-06 11:22'
   *                    opts.showClear {Boolean} 是否显示清除按钮
   *                    opts.showToday {Boolean} 是否显示今天按钮
   *                    opts.placement {String}  [web only] 选择器的位置,可选: left-bottom/right-bottom/left-top/right-top, 默认值: right-bottom
   *                    opts.range     {Object}  [web only] 日期可选范围: {lte: '2016-11-11', gte: '2016-07-07'}
   * @param  {Function} fn   回调方法, fn(data, error)
   *                    data 为成功时的数据: {datetime: '2016-07-07 12:33', date: '2016-07-07', time: '12:33'}
   *                    error 为出错时的具体错误, 如: {calcelled: true} 代表用户取消了选择, 或: {message: '默认值不正确'} 代表具体信息
   * @param  {Element}  _event 内部参数，代表触发的DOM事件
   */
  openDatePicker(opts = {}, fn, _event) {
    let defaultOptions = {
      type: 'date',
      placement: 'right-bottom'
    }
    opts = {...defaultOptions, ...opts}

    if (_event && isPC) {
      opts.ePos = this._getEventPosition(_event)
    }

    return this.send('openDatePicker', opts, null, fn)
  }

  /**
   * 打开附件
   * @param  {Object}  fileInfo 附件对象
   * @param  {Object}  opts     其他配置
   * @param  {DOMEvent} _event  事件对象，用于定位需求
   */
  openAttachment(fileInfo, opts = {}, _event) {
    if (isPC) {
      // web端暂无附件详情展现，这里直接打开源地址
      return window.open(fileInfo.link.source)
      // if (_event) {
      //   opts.ePos = this._getEventPosition(_event)
      // }
    }

    opts.file_info = fileInfo

    this.push('openAttachment', opts)
  }

  /**
   * 设置页面参数
   * @param {Object} config 页面参数
   */
  setPageConfig(config) {
    this.push('setPageConfig', {config})
  }

  /**
   * 安装应用
   * @param  {Integer} applicationId 应用的id
   */
  installApplication(applicationId) {
    this.push('installApplication', {application_id: applicationId})
  }

  _init(applicationId) {
    return this.send('init', {application_id: applicationId}).then(ret => {
      this._ticket = ret.ticket
      this._user = ret.user
      this._table = ret.table || ret.app
      // 兼容旧的数据命名，避免图表应用报错
      // @todo 更新图表使用的app_id为table_id
      if (!this._table.app_id && this._table.table_id) {
        this._table.app_id = this._table.table_id
      }
      this._version = ret.version
      this.appId = applicationId

      return {...ret, app: this._table, table: this._table}
    })
  }

  _getEventPosition(e) {
    let target = e.currentTarget || e.target
    let rect = target.getBoundingClientRect()
    let {top, bottom, left, right, width, height} = rect

    return {
      target: {top, bottom, left, right, width, height, offsetWidth: e.target.offsetWidth, offsetHeight: e.target.offsetHeight},
      clientX: e.clientX,
      clientY: e.clientY,
      offsetX: e.offsetX,
      offsetY: e.offsetY
    }
  }
}

class ClientWeb extends Client {

  init(applicationId) {
    let deferred = defer()

    if (window.parent === window) {
      delay(r => {
        deferred.reject({message: '无法找到宿主环境'})
      })
      return deferred.promise
    }
    if (!window.MessageChannel) {
      delay(r => {
        deferred.reject({message: '您的浏览器不支持 MessageChannel'})
      })
      return deferred.promise
    }

    if (this._ticket && this._user) {
      deferred.resolve({ticket: this._ticket, user: this._user, app: this._table, table: this._table, version: this._version})
      return deferred.promise
    }

    this._id = this._unique_id('c_', 8)

    let mc = new MessageChannel()
    this.port = mc.port1
    this.port.onmessage = this.handleMessage.bind(this)

    window.parent.postMessage(`${MSG_TYPES.CONNECT}:${applicationId}:${this._id}`, HB_HOST, [mc.port2])

    return this._init(applicationId)
  }

  _send(action, data, id) {
    let payload = {action}
    if (data) {
      payload.data = data
    }
    if (id) {
      payload.id = id
    }

    this.port.postMessage(payload)
  }

  _processMessage(e) {
    let eData = e.data
    switch (eData.action) {
      case MSG_TYPES.CONNECT:
        if (eData.data.error) {
          // 这里代表连接被拒绝，需要SDK对外报错
          // this.connect.reject(eData.data.error)
          this.emit('error', {...eData.data.error, type: 'connect'})
          this.emit('error.connect', eData.data.error)
        } else {
          this.connect.resolve(eData.data.result)
        }
        return false
      case MSG_TYPES.CLOSE:
        this.destroy()
        return false
      case MSG_TYPES.PING:
        this.push(MSG_TYPES.PING)
        return false
    }
  }

  handleWindowBeforeUnload(e) {
    this._disconnect()
  }

  _disconnect() {
    this.push(MSG_TYPES.DISCONNECT)
  }

  destroy() {
    super.destroy()
    if (this.port) {
      this._disconnect()
      this.port.close()
      this.port = null
    }
  }
}

class ClientIOSWebview extends Client {

  init(applicationId) {
    // iOS/Android下使用huoban://协议拦截的方式请求，无需初始化
    this.connect.resolve()

    window.HB = window.HB || {}
    window.HB.bridgeCallback = this.handleBridgeInvoke.bind(this, 'callback')
    window.HB.bridgeCancel = this.handleBridgeInvoke.bind(this, 'cancel')
    window.HB.bridgeEmit = this.handleBridgeInvoke.bind(this, 'emit')

    return this._init(applicationId)
  }

  _send(action, data, id) {
    let urlArr = [`huoban://hybrid?action=${encodeURIComponent(action)}`]
    if (id) {
      urlArr.push(`callback=${encodeURIComponent(id)}`)
    }
    if (data) {
      urlArr.push('params=' + encodeURIComponent(JSON.stringify(data)))
    }

    let url = urlArr.join('&')
    this._invokeNative(url)
  }

  _invokeNative(url) {
    let iframe = document.createElement('iframe')
    iframe.style.width = 0
    iframe.style.height = 0
    iframe.style.display = 'none'
    iframe.src = url
    document.body.appendChild(iframe)
    setTimeout(function() {
      iframe.parentNode.removeChild(iframe)
    }, 100)
  }

  handleBridgeInvoke(type, resp) {
    // alert('HB.bridgeInvoke: ' + type + ', with data-type: ' + typeof resp)
    // alert('HB.bridgeInvoke data: ' + JSON.stringify(resp))
    return this.handleMessage({data: resp})
  }
}

class ClientAndroidWebview extends ClientIOSWebview {
  _invokeNative(url) {
    window.prompt(url, '')
  }
}

class Hoster extends Channel {
  init() {
    this.heartbeatFrequency = 5
    this.connections = {}
    this.handleHandshake = this._handleHandshake.bind(this)
    window.addEventListener('message', this.handleHandshake, false)
    this.ready(r => {
      this.runHeartbeatDetection()
    })
  }

  runHeartbeatDetection() {
    this.getPorts().forEach(({client, port, lastPing}) => {
      // 10 秒无心跳，主动断开连接
      if (lastPing && (this.now() - lastPing) > this.heartbeatFrequency * 2 * 1000) {
        console.log('close', client, (this.now() - lastPing) / 1000)
        this._close(client)
      } else {
        this.push(client, MSG_TYPES.PING)
      }
    })

    setTimeout(r => {
      this.runHeartbeatDetection()
    }, this.heartbeatFrequency * 1000)
  }

  destroy(clean) {
    super.destroy()
    this.getPorts().forEach(({client}) => {
      this._close(client)
    })
    this.connections = {}

    if (clean) {
      window.removeEventListener('message', this.handleHandshake)
    }
  }

  _close(client) {
    if (this.connections[client]) {
      this.connections[client].port.close()
      this.connections[client].port.onmessage = null
      delete this.connections[client]
    }
  }

  now() {
    return Date.now()
  }

  report() {
    let conns = 0
    let appClients = this.getPorts().reduce((ret, con) => {
      conns++
      if (!ret[con.application_id]) {
        ret[con.application_id] = 0
      }
      ret[con.application_id]++
      return ret
    }, {})
    let appIds = Object.keys(appClients)

    console.log('当前已连接应用数：', appIds.length, ', 已连接页面总数：', conns, ', 应用计数统计：', appClients)
  }

  getPorts(applicationId) {
    return Object.keys(this.connections).reduce((ret, key) => {
      if (!applicationId || this.connections[key].application_id == applicationId) {
        ret.push(this.connections[key])
      }
      return ret
    }, [])
  }

  _handleHandshake(e) {
    let eDataArr = e.data && e.data.split ? e.data.split(':') : []
    if (eDataArr.length == 3 && eDataArr[0] == MSG_TYPES.CONNECT && e.ports.length) {
      let aId = eDataArr[1]
      let cUnique = eDataArr[2]
      if (!aId || this.getPorts(aId).length >= 10) {
        e.ports[0].postMessage({
          action: MSG_TYPES.CONNECT,
          data: {error: {message: 'Too many connections'}}
        })
        return
      }

      this.connections[cUnique] = {
        client: cUnique,
        application_id: aId,
        port: e.ports[0]
      }

      let responder = (welcomeMessage, errMessage) => {
        if (errMessage) {
          if (this.connections[cUnique]) {
            this._send(cUnique, MSG_TYPES.CONNECT, {error: {message: errMessage}})
          }
          delete this.connections[cUnique]
        } else {
          this.connections[cUnique].port.onmessage = this.handlePortMessage.bind(this, cUnique)
          this.connect.resolve(cUnique)
          this.push(cUnique, MSG_TYPES.CONNECT, {result: {message: welcomeMessage}})
        }
      }

      this.emit('connect', {application_id: aId, origin: e.origin, client: cUnique}, responder)
    }
  }

  send(client, action, data, _id) {
    let id = _id || this._unique_id('h_')

    this.ready(() => {
      this._send(client, action, data, id)
    })

    let deferred = defer()
    this.promises[id] = deferred

    return deferred.promise
  }

  push(client, action, data = null) {
    this.ready(() => {
      this._send(client, action, data)
    })
  }

  _send(client, action, data, id) {
    if (this.connections[client]) {
      let payload = {action}
      if (data) {
        payload.data = data
      }
      if (id) {
        payload.id = id
      }

      this.connections[client].port.postMessage(payload)
    } else {
      this.emit('error', {type: 'send', data: {message: '连接不存在'}})
    }
  }

  handlePortMessage(client, e) {
    if (false === this._processMessage(e, client)) {
      return
    }

    if (!this.connections[client]) {
      throw new Error('message client error: ' + client)
    }

    let eData, id, action
    try {
      eData = e.data
      if (typeof eData == 'string') {
        eData = JSON.parse(eData)
      }
      if (!eData.action && !eData.id && eData.callback) throw new Error()
    } catch (err) {
      throw new Error('HB_APP_SDK: malformed message')
    }

    id = eData.id || eData.callback
    action = eData.action

    let responder
    if (id) {
      responder = (result, error) => {
        if (error) {
          this.connections[client].port.postMessage({id, error})
        } else {
          this.connections[client].port.postMessage({id, result})
        }
      }
    } else {
      // 非回调模式，提供来路回复能力
      // responder = (data) => {
      //   this.connections[client].port.postMessage(data)
      // }
    }

    this.emit(action, {
      application_id: parseInt(this.connections[client].application_id),
      params: eData.data
    }, responder)
  }

  _processMessage(e, client) {
    switch (e.data.action) {
      case MSG_TYPES.DISCONNECT:
        this._close(client)
        return false
      case MSG_TYPES.BROADCAST:
        // 宿主负责转发广播，给[相同应用]的[其他]页面
        this._broadcast(this.connections[client].application_id, e.data.data, [client])
        return false
      case MSG_TYPES.PING:
        // 心跳回包
        this.connections[client].lastPing = this.now()
        return false
    }
  }

  broadcast(action, data, aId = null) {
    this._broadcast(aId, data ? {action, data} : {action})
  }

  _broadcast(aId, data, exclude = []) {
    this.getPorts(aId).forEach(({client, port}) => {
      if (exclude.indexOf(client) === -1) {
        this.push(client, MSG_TYPES.BROADCAST, data)
      }
    })
  }
}

let instance = {}

export function client(handlers) {
  if (!instance.client) {
    if (isAndroid) {
      instance.client = new ClientAndroidWebview()
    } else if (isIPhone || isIPad) {
      instance.client = new ClientIOSWebview()
    } else {
      instance.client = new ClientWeb()
    }
  }

  if (handlers) {
    instance.client.on(handlers)
  }

  return instance.client
}

export function host(handlers) {
  if (!instance.host) {
    instance.host = new Hoster()
    instance.host.init()
  }

  if (handlers) {
    instance.host.on(handlers)
  }

  return instance.host
}
