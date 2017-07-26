'use strict';
var request = require('request');

var trainsUrl = 'https://rata.digitraffic.fi/api/v1/live-trains?station=SLO';
var compositionsUrl = 'https://rata.digitraffic.fi/api/v1/compositions/<train>?departure_data=<date>';

// var url = 'https://api.github.com/users/rsp';

// request.get({
//     url: trainsUrl,
//     json: true,
//     headers: {'User-Agent': 'request'}
//   }, (err, res, data) => {
//     if (err) {
//       console.log('Error:', err);
//     } else if (res.statusCode !== 200) {
//       console.log('Status:', res.statusCode);
//     } else {
//       // data is already parsed as JSON:
//       console.log(data);
//     }
// });

var express = require('express'),
  app = express(),
  port = process.env.PORT || 3000;

var queryTrainComposition = function(req,res) {
  if (0) {
    res.send('error');
  } else {
    res.json({foo: 'bar'});
  }
}

app.route('/train-composition')
  .get(queryTrainComposition)
  .post(queryTrainComposition);

app.listen(port);

console.log('TRAINS API server started, port:' + port);

