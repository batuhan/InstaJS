var express = require('express');
var bodyParser = require('body-parser');

var app = express();

app.use(bodyParser.json());
app.use(bodyParser.urlencoded());

app.get('/go', function(req, res){
    res.redirect("https://api.instagram.com/oauth/authorize/?response_type=token&redirect_uri=" + encodeURIComponent(req.protocol + "://" + req.get('host') + "/cb?url=" + req.query.redirect_uri) + "&scope=" + req.query.scope + "&client_id=" + req.query.client_id)
});

app.get('/cb', function(req, res){
    res.send("<html><body><script>window.location = decodeURIComponent(window.location.search.split('?url=')[1]) + window.location.hash;</script></body></html>");
});

app.set('port', process.env.PORT || 3000);

var server = app.listen(app.get('port'), function() {
  console.log('Express server listening on port ' + server.address().port);
});