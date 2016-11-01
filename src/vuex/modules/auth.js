import { auth } from '../types'

// 初始化应用的数据
const state = {
  user: null,
  ticket: 'XTf2SyNyth7qrBYhoVtJRxikEfBmQxIWaToUXv6yRhfKzpRg37Iuf+3G4Wwi5xZRssBcZHs5Qn5KdmJ89KsQycyGlnDYonhPNPafM7iYYlOT9FHLrzD37SbY0hPYq5nFkk1hySuc2ETRh+mQ+UsjSGskIUxPFCQAySg80NqF2Bw=',
  app: null,
  appId: null,
  tableId: null
}

const mutations = {
  // 取得应用的初始化信息
  [auth.GET_INITINFO](state, initInfo) {
    state.user = initInfo.user
    state.ticket = initInfo.ticket
    state.app = initInfo.app
    state.appId = initInfo.app_id || initInfo.appId
    state.tableId = initInfo.table.table_id
  }
}

export default {
  state,
  mutations
}