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
var css = fs.readFileSync(path.join(__dirname, 'style.css'))
var head = '<!doctype html><head><meta charset=utf-8><title>GitHub followers</title><style type="text/css">' + css + '</style></head><body><div id=container>'
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

var userDiv = function (login, avatar, rank) {
  return util.format('<div class=user style="background-image: url(%s)"><a href="https://github.com/%s"><span class=name>%s</span><span class=rank>%s</span></a></div>', avatar, login, login, rank)
}

patterns.add('GET /{username}', function (req, res) {
  var username = req.params.username
  var opts = {
    uri: 'https://api.github.com/users/' + username + '/followers',
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

    var rank = top10k.indexOf(username)
    rank = rank === -1 ? 'no rank' : rank + 1

    var body = [head]
    body.push(userDiv(username, 'https://github.com/' + username + '.png', rank))
    body.push('<h2>Top Github followers</h2>')
    body.push('<div id=followers>')

    data
      .filter(function (user) {
        return ~top10k.indexOf(user.login)
      })
      .sort(function (a, b) {
        a = top10k.indexOf(a.login)
        b = top10k.indexOf(b.login)
        return a - b
      })
      .forEach(function (user) {
        var rank = top10k.indexOf(user.login)
        body.push(userDiv(user.login, user.avatar_url, rank))
      })

    body.push('</div>')
    body.push('<a href="https://github.com/watson/github-followers"><img style="position: absolute; top: 0; right: 0; border: 0;" src="https://camo.githubusercontent.com/38ef81f8aca64bb9a64448d0d70f1308ef5341ab/68747470733a2f2f73332e616d617a6f6e6177732e636f6d2f6769746875622f726962626f6e732f666f726b6d655f72696768745f6461726b626c75655f3132313632312e706e67" alt="Fork me on GitHub" data-canonical-src="https://s3.amazonaws.com/github/ribbons/forkme_right_darkblue_121621.png"></a>')
    body.push('</div>')
    body = body.join('\n')

    res.writeHead(200, {
      'Content-Type': 'text/html',
      'Content-Length': Buffer.byteLength(body)
    })
    res.end(body)
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
