var insertCss = require('insert-css')
var EventEmitter = require('events').EventEmitter
var inherits = require('inherits')
var once = require('once')
var xhr = require('xhr')

var urlSupport = ('URL' in window && URL.createObjectURL)
var blobSupport = ('Blob' in window)

module.exports = Preload

inherits(Preload, EventEmitter)
function Preload() {
  if (!(this instanceof Preload)) return new Preload
  EventEmitter.call(this)
  this.targets = {}
  this.done = false
  this.targetCount = 0
}

var proto = Preload.prototype

proto.js = function js(src, callback) {
  callback = callback || throwop
  if (Array.isArray(src)) return many(this, 'js', src, callback)

  var self = this
  watch(this, src, xhr({
      uri: src
    , timeout: 60000 * 10 // 10 minutes
  }, function(err, res, body) {
    if (err) return callback(err)
    var script = document.createElement('script')
    self.progress(src, self.targets[src] = 1)

    if (!blobSupport || !urlSupport) {
      // using encodeURIComponent instead of base64 to support all of utf-8
      // perhaps a better workaround?
      script.setAttribute('src', 'data:text/javascript;charset=UTF-8,' + encodeURIComponent(body))
    } else {
      var blob = new Blob([body], { type: 'text/javascript' })
      script.setAttribute('src', URL.createObjectURL(blob))
    }

    document.body.appendChild(script)
    callback()
  }))

  return this
}

proto.css = function css(src, callback) {
  callback = callback || throwop
  if (Array.isArray(src)) return many(this, 'css', src, callback)

  var self = this
  watch(this, src, xhr({
      uri: src
    , timeout: 60000 * 10 // 10 minutes
  }, function(err, res, body) {
    if (err) return callback(err)
    self.progress(src, self.targets[src] = 1)
    insertCss(body)
  }))

  return this
}

proto.img = function img(src, callback) {
  callback = callback || throwop
  if (Array.isArray(src)) return many(this, 'img', src, callback)

  var self = this
  if (!blobSupport) {
    var img = document.createElement('img')
    self.targets[src] = 0
    self.targetCount++
    img.onload = function() {
      self.progress(src, self.targets[src] = 1)
      callback()
    }
    img.src = src
  } else {
    var req = watch(this, src, xhr({
        uri: src
      , timeout: 60000 * 10 // 10 minutes
    }, function(err, res, body) {
      if (err) return callback(err)
      self.progress(src, self.targets[src] = 1)
    }))

    req.responseType = 'blob'
  }

  return this
}

proto.progress = function progress(src, progress) {
  var total = 0
  for (var key in this.targets) {
    if (this.targets.hasOwnProperty(key)) {
      total += this.targets[key] / this.targetCount
    }
  }

  this.emit('progress', src, progress, total)
  if (total >= 1 && !this.done) {
    this.done = true
    this.emit('done')
  }

  return this
}

function watch(self, src, req) {
  self.targets[src] = 0
  self.targetCount++

  req.onprogress = function(e) {
    var value = e.lengthComputable ? e.loaded / e.total : 0
    self.targets[src] = value
    self.progress(src, value)
  }

  return req
}

function many(self, key, values, callback) {
  callback = once(callback)

  var responses = []
  var counter = values.length

  for (var i = 0; i < counter; i += 1) (function(i) {
    self[key](values[i], function(err, res) {
      if (err) return callback(err)
      responses[i] = res
      if (!counter--) callback(null, values)
    })
  })(i)

  return self
}

function throwop(err) {
  if (err) throw err
}
