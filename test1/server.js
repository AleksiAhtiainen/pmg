'use strict';

// TODO: cleanup console.logs

var request = require('request-promise-native');

var express = require('express');
var bodyParser = require('body-parser');

// Config
const port = process.env.PORT || 3000;
const liveTrainsApiUrl = 'https://rata.digitraffic.fi/api/v1/live-trains';
const compositionsApiUrl = 'https://rata.digitraffic.fi/api/v1/compositions';

var app = express();

// Use body-parser to parse the POST parameters
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// 1. Get the live-trains data
// 2. Filter the live-trains data to contain only the queried train numbers
// 3. Get the compositions data using the departure dates from the filtered live-trains data
//    - Current date could also be used, but using this is probably more robust for handling 
//      trains that travel over midnight
// 4. Format and return the final response by zipping the train data with the compositions data
var trainComposition = function(stationShortCode, trainNumberString, resApi) {
  // TODO: parameter validation

  const trainNumbers = trainNumberString.split(',').map(Number);

  console.log('Query station:' + stationShortCode);
  console.log('Query train numbers:' + trainNumbers);

  const liveTrainsUrl = liveTrainsApiUrl + '?station=' + stationShortCode;

  request.get({
      url: liveTrainsUrl,
      json: true,
      headers: {'User-Agent': 'request'}
    })
    .then(fullTrainsData => {

      console.log('Live trains query results:' + fullTrainsData);

      // filter the array by the trainNumbers from the query

      // TODO: Consider sorting the data to the same order as the queried numbers.
      const trainsData = 
        fullTrainsData.filter(train => trainNumbers.includes(train.trainNumber));

      const compositionsUrls = 
        trainsData.map(train => 
          compositionsApiUrl + '/' + train.trainNumber + '?departure_date=' + train.departureDate);

      console.log('compositionsUrls:' + compositionsUrls);

      var compositionsPromises = compositionsUrls.map((url) => {
        return request.get({
            url: url,
            json: true,
            headers: {'User-Agent': 'request'}
          });
      });

      Promise.all(compositionsPromises)
        .then((compositionsData) => {
          console.log('Compositions query results:' + compositionsData);

          // Create composition data
          const resultCompositionsData = compositionsData.map((composition) => { 
            if (!composition || !composition.journeySections) {
              // Don't reject the whole query, if some train doesn't have
              // composition information
              return undefined;
            } else {
              return composition.journeySections.map((journeySection) => {
                return {
                  from: journeySection.beginTimeTableRow.stationShortCode,
                  to: journeySection.endTimeTableRow.stationShortCode,
                  wagons: journeySection.wagons,
                  locomotives: journeySection.locomotives
                };
              });              
            } 
          })

          // Create the final result object by zipping the trains data with
          // the compositions data
          var resultData = trainsData.map((train, index) => {
            return {
              departureDate: train.departureDate,
              trainName: train.trainType + train.trainNumber,

              // The time table rows are ordered by the train's route
              departureStation: train.timeTableRows[0].stationShortCode, 
              destinationStation: train.timeTableRows[train.timeTableRows.length - 1].stationShortCode,
              composition: resultCompositionsData[index]
            }
          });

          console.log('Query response:' + JSON.stringify(resultData));

          resApi.json(resultData);

       })
        .catch((err) => {
          console.log('Failed to retrieve data:', err);
          // Return error with the same status as the wrapped interface
          resApi.status(err.statusCode).send({ error: 'Failed to retrieve data'});
        });
    })
    .catch((err) => {
      console.log('Failed to retrieve data:', err);
      // Return error with the same status as the wrapped interface
      resApi.status(err.statusCode).send({ error: 'Failed to retrieve data'});
    });
}

var getTrainComposition = function(req, res) {
  // TODO: approve also URL parameters?
  return trainComposition(req.query.stationShortCode, req.query.trainNumber, res);
}

var postTrainComposition = function(req, res) {
  // TODO: approve also query or URL parameters?
  return trainComposition(req.body.stationShortCode, req.body.trainNumber, res);
}

// TODO: add swagger-jsdoc documentation
app.route('/train-composition')
  .get(getTrainComposition) // TODO: Remove GET, not required in the specification
  .post(postTrainComposition);

app.listen(port);

console.log('TRAINS API server started, port:' + port);

