export default function(router, store) {
  router.map({
    '/': {
      name: 'home',
      displayName: '首页',
      component: require('./views/home'),
      subRoutes: {
      }
    }
  })

  router.alias({
    '/index': '/'
  })

  router.redirect({
    '*': '/' // default router
  })
}
