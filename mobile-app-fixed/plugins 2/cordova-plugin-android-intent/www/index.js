var noop = function () {}

var toError = function (obj) {
  if (!obj) return new Error('ERROR')
  if (obj instanceof Error) return obj
  return new Error(obj)
}

module.exports = function (options, cb) {
  if (!cb && typeof options === 'function') {
    cb = options
    options = null
  }

  if (!options) options = {}
  if (!cb) cb = noop

  window.cordova.exec(function (result) {
    cb(null, result.data)
  }, function (err) {
    cb(toError(err))
  }, 'IntentPlugin', '', [options])
}
