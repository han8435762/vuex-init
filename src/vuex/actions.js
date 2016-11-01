// import Api from '../api'
import * as types from './types'

export const getInitInfo = ({dispatch, state}, result) => {
  dispatch(types.auth.GET_INITINFO, result)
}

