'use strict';

var request = require('request');
var express = require('express');
var bodyParser = require('body-parser');

// Config
var port = process.env.PORT || 3000;

var trainsUrl = 'https://rata.digitraffic.fi/api/v1/live-trains?station=';
var compositionsUrl = 'https://rata.digitraffic.fi/api/v1/compositions/<train>?departure_data=<date>';

var app = express();

// Use body-parser to parse the POST parameters
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

var trainComposition = function(paramObject, reqApi, resApi) {
  var stationShortCode  = paramObject.stationShortCode;
  var trainNumbers = paramObject.trainNumber.split(',').map(Number);

  console.log('Query station:' + stationShortCode);
  console.log('Query train numbers:' + trainNumbers);

  // TODO: parameter validation and error handling

  var trainsUrl = 'https://rata.digitraffic.fi/api/v1/live-trains?station=' + stationShortCode;

  request.get({
      url: trainsUrl,
      json: true,
      headers: {'User-Agent': 'request'}
    }, (err, res, data) => {
      if (err) {
        console.log('Error:', err);
      } else if (res.statusCode !== 200) {
        console.log('Status:', res.statusCode);
      } else {
        // data is already parsed as JSON

        // filter the list by the trainNumbers from the query
        data = data.filter(function (trainData) {
          return trainNumbers.includes(trainData.trainNumber); 
        });

        // TODO: Get the compositions
        // Do this using multiple asynchronous requests? On the other hand,
        // it might overflow the compositions API, so doing this in sequence might
        // actually be better.
        
        var resultData = data.map(function (train) {
          return {
            departureDate: train.departureDate,
            trainName: train.trainType + train.trainNumber,

            // The time table rows are ordered by the train's route
            departureStation: train.timeTableRows[0].stationShortCode, 
            destinationStation: train.timeTableRows[train.timeTableRows.length - 1].stationShortCode,
          }
        });

        console.log('Query response:' + resultData);

        resApi.json(resultData);
      }
  });
}

var getTrainComposition = function(req, res) {
  return trainComposition(req.query, req, res);
}

var postTrainComposition = function(req,res) {
  return trainComposition(req.body, req, res);
}

app.route('/train-composition')
  .get(getTrainComposition)
  .post(postTrainComposition);

app.listen(port);

console.log('TRAINS API server started, port:' + port);

