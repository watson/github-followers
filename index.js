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
var pkg = require('./package')

var userAgent = pkg.name + '/' + pkg.version
var css = fs.readFileSync(path.join(__dirname, 'style.css'))
var head = '<!doctype html><head><meta charset=utf-8><title>GitHub followers</title><style type="text/css">' + css + '</style></head><body><div id=container>'
var foot = '<a href="https://github.com/watson/github-followers"><img style="position: absolute; top: 0; right: 0; border: 0;" src="https://camo.githubusercontent.com/38ef81f8aca64bb9a64448d0d70f1308ef5341ab/68747470733a2f2f73332e616d617a6f6e6177732e636f6d2f6769746875622f726962626f6e732f666f726b6d655f72696768745f6461726b626c75655f3132313632312e706e67" alt="Fork me on GitHub" data-canonical-src="https://s3.amazonaws.com/github/ribbons/forkme_right_darkblue_121621.png"></a>' +
  '<script>(function(i,s,o,g,r,a,m){i[\'GoogleAnalyticsObject\']=r;i[r]=i[r]||function(){ (i[r].q=i[r].q||[]).push(arguments)},i[r].l=1*new Date();a=s.createElement(o), m=s.getElementsByTagName(o)[0];a.async=1;a.src=g;m.parentNode.insertBefore(a,m) })(window,document,\'script\',\'//www.google-analytics.com/analytics.js\',\'ga\'); ga(\'create\', \'' + process.env.GA_TRACKING_ID + '\', \'auto\'); ga(\'send\', \'pageview\'); </script>'
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

var form = function (login, avatar, rank) {
  return '<form onsubmit="window.location = document.getElementById(\'username\').value; return false"><input type=text name=username id=username placeholder="Enter GitHub username"> <input type=submit value=View></form>'
}

var userDiv = function (login, avatar, rank) {
  rank = rank ? '#' + rank : 'no rank'
  return util.format('<div class=user style="background-image: url(%s)"><a href="https://github.com/%s"><span class=name>%s</span><span class=rank>%s</span></a></div>', avatar, login, login, rank)
}

patterns.add('GET /', function (req, res) {
  res.end(head + form() + foot)
})

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
      opbeat.captureError(err)
      res.writeHead(500)
      res.end(err.message)
      return
    }
    if (!Array.isArray(data)) {
      res.writeHead(404)
      res.write(head)
      res.write('Could not find ' + username + ' on GitHub')
      res.write(form())
      res.write(foot)
      res.end()
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

    var body = [head]
    body.push(userDiv(username, 'https://github.com/' + username + '.png', rank))
    body.push('<h2>Top GitHub followers</h2>')
    body.push('<p>These people follow ' + username + ' and are all among the top 10k most active GitHub users in the world</p>')
    body.push('<div id=followers>')

    data.forEach(function (user) {
      var rank = top10k.indexOf(user.login) + 1
      body.push(userDiv(user.login, user.avatar_url, rank))
    })

    body.push('<div id=twitter><span><a href="https://twitter.com/share" class="twitter-share-button" data-text="Which top 10k most active GitHub follows you? These follow me:" data-size="large" data-count="none" data-dnt="true">Tweet</a><script>!function(d,s,id){var js,fjs=d.getElementsByTagName(s)[0],p=/^http:/.test(d.location)?\'http\':\'https\';if(!d.getElementById(id)){js=d.createElement(s);js.id=id;js.src=p+\'://platform.twitter.com/widgets.js\';fjs.parentNode.insertBefore(js,fjs);}}(document, \'script\', \'twitter-wjs\');</script></span></div>')

    if (!data.length) body.push('<p style="clear: both">' + username + ' doesn\'t yet have any followers in top 10k :(<br /><strong>You\'re ' + username + '? You need to <a href="https://guides.github.com/activities/contributing-to-open-source/">step up your open souce game</a>!</strong></p>')

    body.push('</div>')
    body.push(form())
    body.push('</div>')
    body.push(foot)
    body = body.join('\n')

    res.writeHead(200, {
      'Content-Type': 'text/html',
      'Content-Length': Buffer.byteLength(body)
    })
    res.end(body)
  })
})

var server = http.createServer(function (req, res) {
  var ptn = req.method + ' ' + req.url
  debug(ptn)
  var match = patterns.match(ptn)

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
  debug('Server listening on port ' + server.address().port)
})
