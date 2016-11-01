// 对于异步操作，预定义发起(后缀`REQ`)、成功(无后缀)、失败(后缀`FAIL`) 三种状态
// 方便业务使用

import _ from 'lodash'

const cv = (arr) => {
  return _.reduce(arr, (ret, val) => {
    if (val) {
      ret[val] = val
    }
    return ret
  }, {})
}
//创建请求的三种状态
const resourceMaker = (ajaxResources=[], normalResources=[], prefix='') => {
  let ret = _.reduce(ajaxResources, (ret, val) => {
    ret[`${val}`] = `${prefix}${val}`
    ret[`${val}_REQ`] = `${prefix}${val}_REQ`
    ret[`${val}_FAIL`] = `${prefix}${val}_FAIL`
    return ret
  }, {})

  ret = _.reduce(normalResources, (ret, val) => {
    ret[`${val}`] = `${prefix}${val}`
    return ret
  }, ret)

  return ret
}

export const auth = cv([
  'GET_INITINFO'
])