<template>
  <div>
    <router-view v-if="isRender"></router-view>
    <div class="mod_loader" v-if="!isRender"><span class="loader"></span></div>
  </div>
</template>
<script>
import { getInitInfo } from 'src/vuex/actions'
import store from './vuex/store'
export default {
  replace: true,
  store,
  components: {},
  vuex: {
    actions: {
      getInitInfo
    }
  },
  data() {
    return {
      isRender: false
    }
  },
  ready() {
    this.isRender = true
    // 获取table认证数据
    // if (this.$route.name === 'share') {
    //   this.isRender = true
    // } else {
    //   this.client = window.HuobanAppSDK.client()
    //   this.client.on('error.connect', err => {
    //     // console.log('error.connect', err)
    //     this.isRender = true
    //     this.$router.go({name: 'error', query: {type: 'error', routerName: 'home'}})
    //   })
    //   this.client.init(11007).then(ret => {
    //     // console.log('init success', ret)
    //     this.isRender = true
    //     if (ret.table && ret.ticket) {
    //       this.getInitInfo(ret)
    //     } else {
    //       this.$router.go({name: 'error', query: {type: 'error', routerName: 'home'}})
    //     }
    //   }).catch(err => {
    //     // console.log('init failed', err)
    //     this.isRender = true
    //     this.$router.go({name: 'error', query: {type: 'error', routerName: 'home'}})
    //   })
    // }
  }
}
</script>

