'use strict'

var fs = require('fs')
var path = require('path')
var util = require('util')
var http = require('http')
var opbeat = require('opbeat')()
var debug = require('debug')('followers')
var patterns = require('patterns')()
var request = require('request')
var csv = require('csv-parser')
var Handlebars = require('handlebars')
var pkg = require('./package')

var githubUsername = /^([A-Za-z\d]|[A-Za-z\d][-A-Za-z\d]*[A-Za-z\d])$/
var userAgent = pkg.name + '/' + pkg.version
var css = new Handlebars.SafeString(fs.readFileSync(path.join(__dirname, 'style.css')).toString())
var tmpl = Handlebars.compile(fs.readFileSync(path.join(__dirname, 'tmpl.html')).toString())
var top10k = []

debug('Loading top 10k GitHub users')
fs.createReadStream(path.join(__dirname, 'top-10K.csv'))
  .pipe(csv())
  .on('data', function (data) {
    top10k.push(data.login)
  })
  .on('end', function () {
    debug('Finished loading top 10k GitHub users')
  })

var userDiv = function (login, avatar, rank) {
  rank = rank ? '#' + rank : 'no rank'
  return util.format('<div class=user style="background-image: url(%s)"><a href="https://github.com/%s"><span class=name>%s</span><span class=rank>%s</span></a></div>', avatar, login, login, rank)
}

var respond = function (res, body, status) {
  body = tmpl({
    css: css,
    gaTrackingId: process.env.GA_TRACKING_ID,
    body: new Handlebars.SafeString(body)
  })
  res.writeHead(status || 200, {
    'Content-Type': 'text/html; charset=utf-8',
    'Content-Length': Buffer.byteLength(body)
  })
  res.end(body)
}

patterns.add('GET /', function (req, res) {
  respond(res, '')
})

patterns.add('GET /{username}', function (req, res) {
  var username = req.params.username

  if (!githubUsername.test(username)) {
    var body = username + ' is an invalid GitHub username'
    respond(res, body, 404)
    return
  }

  var opts = {
    uri: 'https://api.github.com/users/' + username + '/followers?client_id=' + process.env.GITHUB_APP_CLIENT_ID + '&client_secret=' + process.env.GITHUB_APP_CLIENT_SECRET,
    json: true,
    headers: {
      'User-Agent': userAgent
    }
  }

  request(opts, function (err, response, data) {
    var body
    debug('Remaining GitHub API requests: ' + response.headers['x-ratelimit-remaining'])

    if (err) {
      opbeat.captureError(err)
      respond(res, err.message, 500)
      return
    }
    if (response.statusCode === 404) {
      body = 'Could not find ' + username + ' on GitHub'
      respond(res, body, 404)
      return
    }
    if (data.message) {
      opbeat.captureError(data.message)
      body = 'Sorry :( An unexpected error occurred when trying to look up ' + username + ' on GitHub'
      respond(res, body, 500)
      return
    }

    data = data
      .filter(function (user) {
        return ~top10k.indexOf(user.login)
      })
      .sort(function (a, b) {
        a = top10k.indexOf(a.login)
        b = top10k.indexOf(b.login)
        return a - b
      })

    var rank = top10k.indexOf(username)
    if (rank === -1) rank = null

    body = []
    body.push(userDiv(username, 'https://github.com/' + username + '.png', rank))

    if (data.length) {
      body.push('<h2>Top GitHub followers</h2>')
      body.push('<p>These people follow ' + username + ' and are all among the top 10k most active GitHub users in the world</p>')
    } else {
      body.push('<h2>Sorry, no GitHub followers in top 10k :(</h2>')
      body.push('<p>You\'re ' + username + '? You need to <a href="https://guides.github.com/activities/contributing-to-open-source/">step up your open source game</a>!</p>')
    }

    body.push('<div id=followers>')
    data.forEach(function (user) {
      var rank = top10k.indexOf(user.login) + 1
      body.push(userDiv(user.login, user.avatar_url, rank))
    })
    body.push('<div id=twitter><span><a href="https://twitter.com/share" class="twitter-share-button" data-text="Which top 10k most active GitHub follows you? These follow me:" data-size="large" data-count="none" data-dnt="true">Tweet</a><script>!function(d,s,id){var js,fjs=d.getElementsByTagName(s)[0],p=/^http:/.test(d.location)?\'http\':\'https\';if(!d.getElementById(id)){js=d.createElement(s);js.id=id;js.src=p+\'://platform.twitter.com/widgets.js\';fjs.parentNode.insertBefore(js,fjs);}}(document, \'script\', \'twitter-wjs\');</script></span></div>')
    body.push('</div>')

    body = body.join('\n')

    respond(res, body)
  })
})

var server = http.createServer(function (req, res) {
  var ptn = req.method + ' ' + req.url
  debug(ptn)
  var match = patterns.match(ptn)

  if (!match) return respond(res, '', 404)

  var fn = match.value
  req.params = match.params
  fn(req, res)
})

server.listen(process.env.PORT, function () {
  debug('Server listening on port ' + server.address().port)
})
