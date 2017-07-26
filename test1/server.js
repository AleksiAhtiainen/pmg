'use strict';

//var request = require('request');
var request = require('request-promise-native');

var express = require('express');
var bodyParser = require('body-parser');

// Config
var port = process.env.PORT || 3000;
var trainsApiUrl = 'https://rata.digitraffic.fi/api/v1/live-trains';
var compositionApiUrl = 'https://rata.digitraffic.fi/api/v1/compositions';

//var trainsUrl = 'https://rata.digitraffic.fi/api/v1/live-trains?station=';
//var compositionsUrl = 'https://rata.digitraffic.fi/api/v1/compositions/<train>?departure_data=<date>';

var app = express();

// Use body-parser to parse the POST parameters
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

var trainComposition = function(paramObject, reqApi, resApi) {
  // TODO: parameter validation and error handling:

  // TODO: Clean up the code to use promises more cleanly, e.g.
  // the data returned from the 2 APIs can be combined together
  // more cleanly by the trainNumber as an id.

  var stationShortCode  = paramObject.stationShortCode;

  var trainNumbers = paramObject.trainNumber.split(',').map(Number);

  console.log('Query station:' + stationShortCode);
  console.log('Query train numbers:' + trainNumbers);

  var trainsUrl = trainsApiUrl + '?station=' + stationShortCode;

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
        data = data.filter((trainData) => {
          return trainNumbers.includes(trainData.trainNumber); 
        });

        // TODO: sort the data to the same order as the queried numbers? This
        // was not specified as a requirement, though

        // TODO: Get the compositions
        // Do this using multiple asynchronous requests? On the other hand,
        // it might overflow the compositions API, so doing this in sequence might
        // actually be better.

        var compositionUrls = data.map((train) => {
          // It is probably safer to use the date returned from the live-trains API (vs current date), since it 
          // probably works better with trains that travel across midnight

          return compositionApiUrl + '/' + train.trainNumber + '?departure_date=' + train.departureDate;
        });

        console.log('compositionUrls:' + compositionUrls);

        const compositionPromises = compositionUrls.map((url) => {
          return request.get({
              url: url,
              json: true,
              headers: {'User-Agent': 'request'}
            });
        });

        Promise.all(compositionPromises).then((compositionData) => {
          console.log('Composition query results:' + compositionData);

          // Create composition data
          var resultCompositionData = compositionData.map((composition) => { 
            return composition.journeySections.map((journeySection) => {
              return {
                from: journeySection.beginTimeTableRow.stationShortCode,
                to: journeySection.endTimeTableRow.stationShortCode,
                wagons: journeySection.wagons,
                locomotives: journeySection.locomotives
              };
            });
          });

          // Create the result object 
          var resultData = data.map((train, index) => {
            return {
              departureDate: train.departureDate,
              trainName: train.trainType + train.trainNumber,

              // The time table rows are ordered by the train's route
              departureStation: train.timeTableRows[0].stationShortCode, 
              destinationStation: train.timeTableRows[train.timeTableRows.length - 1].stationShortCode,
              composition: resultCompositionData[index]
            }
          });

          console.log('Query response:' + resultData);

          resApi.json(resultData);

        });

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

