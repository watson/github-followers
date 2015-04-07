'use strict'

var fs = require('fs')
var path = require('path')
var util = require('util')
var http = require('http')
var patterns = require('patterns')()
var request = require('request')
var csv = require('csv-parser')
var pkg = require('./package')

var env = process.env.NODE_ENV || 'development'
var userAgent = pkg.name + '/' + pkg.version
var head = '<!doctype html><head><meta charset=utf-8><title>GitHub followers</title></head><body>'
var top10k = []

console.log('Loading top 10k Github users')
fs.createReadStream(path.join(__dirname, 'top-10K.csv'))
  .pipe(csv())
  .on('data', function (data) {
    top10k.push(data.login)
  })
  .on('end', function () {
    console.log('Finished loading top 10k Github users')
  })

patterns.add('GET /', function (req, res) {
  res.end(head + '<input type=text name=username id=username placeholder="Enter GitHub username"><button onclick="window.location = document.getElementById(\'username\').value">Submit</button>')
})

patterns.add('GET /{username}', function (req, res) {
  var opts = {
    uri: 'https://api.github.com/users/' + req.params.username + '/followers',
    json: true,
    headers: {
      'User-Agent': userAgent
    }
  }
  request(opts, function (err, response, data) {
    if (err) {
      res.writeHead(500)
      res.end(err.message)
      return
    }
    if (!Array.isArray(data)) {
      res.writeHead(404)
      res.end()
      return
    }

    var rank = top10k.indexOf(req.params.username)
    rank = rank === -1 ? 'unknown' : rank + 1

    res.write(head)
    res.write('<p>Listing followers of ' + req.params.username + ' (rank: ' + rank + ')')
    res.write('<table><thead><tr><th></th><th>Username</th><th>Rank</th></tr></thead><tbody>')

    data
      .sort(function (a, b) {
        a = top10k.indexOf(a.login)
        b = top10k.indexOf(b.login)
        if (a === b) return 0
        if (a === -1) return 1
        if (b === -1) return -1
        return a - b
      })
      .forEach(function (user) {
        var rank = top10k.indexOf(user.login)
        rank = rank === -1 ? 'unknown' : rank + 1
        res.write(util.format('<tr><td><img src="%s" heigth=50 width=50></td><td><a href="https://github.com/%s">%s</a></td><td>%s</td></tr>', user.avatar_url, user.login, user.login, rank))
      })

    res.end('</tbody></table>')
  })
})

var server = http.createServer(function (req, res) {
  if (env !== 'production') console.log(req.method, req.url)

  var match = patterns.match(req.method + ' ' + req.url)

  if (!match) {
    res.writeHead(404)
    res.end()
    return
  }

  var fn = match.value
  req.params = match.params
  fn(req, res)
})

server.listen(process.env.PORT, function () {
  console.log('Server listening on port', server.address().port)
})
