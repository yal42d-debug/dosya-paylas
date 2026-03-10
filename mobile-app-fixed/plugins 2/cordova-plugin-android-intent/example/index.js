var textarea = document.getElementById('console')

var log = function () {
  console.log.apply(console, arguments)

  var args = Array.prototype.slice.call(arguments).map(function (arg) {
    if (arg instanceof Error) return `{Error: ${arg.message}}`
    else if (typeof arg === 'object' && arg) return JSON.stringify(arg)
    else return String(arg)
  })

  textarea.value += `> ${args.join(' ')}\n`
}

document.addEventListener('deviceready', function () {
  log('deviceready')

  setTimeout(function () {
    log('opening http://example.com')

    window.cordova.plugins.Intent({
      action: 'android.intent.action.VIEW',
      data: 'http://example.com'
    })
  }, 1000)
}, false)
