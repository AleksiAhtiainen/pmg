'use strict';

const request = require('request-promise-native');
const express = require('express');
const bodyParser = require('body-parser');

const swaggerJsDoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');

// Config
const port = process.env.PORT || 3000;
const hostName = process.env.HOSTNAME || 'localhost';
const liveTrainsApiUrl = 'https://rata.digitraffic.fi/api/v1/live-trains';
const compositionsApiUrl = 'https://rata.digitraffic.fi/api/v1/compositions';
const swaggerUiRoute = '/api-docs';

// Swagger top-level configuration
const swaggerSpec = swaggerJsDoc({
  swaggerDefinition: {
    info: {
      title: 'Trains API',
      version: '0.0.1',
      description: 'API for retrieving information about trains'
    },
    host: hostName + ':' + port,
    basePath: '/'
  },
  apis: ['./server.js']
});

var app = express();

// body-parser is used to parse the POST parameters
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Main algorithm:
//
// 1. Get the live-trains data from digitraffic
// 2. Filter the live-trains data to contain only the queried train numbers
// 3. Get the compositions data from digitraffic using the departure dates from the filtered live-trains data
//    - Current date could also be used, but using retrieve departure date is probably more robust for handling 
//      trains that travel over midnight
// 4. Format and return the final response by zipping the train data with the compositions data
const trainComposition = function(stationShortCode, trainNumberString, resApi) {

  // 1. Get the live-trains data from digitraffic
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

      // 2. Filter the live-trains data to contain only the queried train numbers
      const trainsData = 
        fullTrainsData.filter(train => trainNumbers.includes(train.trainNumber));

      // 3. Get the compositions data
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

          // 4. Format and return the final response by zipping the trains data with
          // the compositions data
          const resultData = trainsData.map((train, index) => {
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

const postTrainComposition = function(req, res) {
  return trainComposition(req.body.stationShortCode, req.body.trainNumber, res);
}

/**
 * @swagger
 * definitions:
 *   Composition:
 *     properties:
 *       from:
 *         description: Begin station of the composition
 *         type: string
 *       to:
 *         description: End station of the composition
 *         type: string
 *       wagons:
 *         type: string
 *         format: json
 *         description: Wagon information as JSON returned by the digitraffic API
 *       locomotives:
 *         type: string
 *         format: json
 *         description: Locomotive information as JSON returned by the digitraffic API
 *   Train:
 *     type: object
 *     properties:
 *       departureDate:
 *         description: Departure date
 *         type: string
 *       trainName:
 *         description: train name
 *         type: string
 *       departureStation:
 *         description: Departure station
 *         type: string
 *       destinationStation:
 *         description: Destination station
 *         type: string
 *       compositions:
 *         description: An array of train composition information
 *         $ref: '#/definitions/Composition'
 *   CompositionRequest:
 *     type: object
 *     description: Body data for composition information request
 *     properties:
 *       stationShortCode:
 *         type: string
 *         description: Station short name in format of the digitraffic API.
 *         example: SLO
 *       trainNumber:
 *         type: string
 *         description: Number or comma-separated list of integer numbers of trains. Valid numbers depend upon time of day, check https://rata.digitraffic.fi/api/v1/live-trains?station=SLO .
 *         example: 947,948
 */

/**
 * @swagger
 * /train-composition:
 *   post:
 *     description: Retrieve train composition information
 *     produces:
 *       - application/json
 *     consumes:
 *       - application/json
 *     parameters:
 *       - name: body
 *         in: body
 *         description: The body of the request
 *         required: true
 *         schema:
 *           $ref: '#/definitions/CompositionRequest'
 *     responses:
 *       200:
 *         description: An array of train information
 *         schema:
 *           $ref: '#/definitions/Train'
 */
app.post('/train-composition', postTrainComposition);
app.use(swaggerUiRoute, swaggerUi.serve, swaggerUi.setup(swaggerSpec, true));

app.listen(port);

console.log('TRAINS API server started at http://' + hostName + ':' + port + '/');
console.log('Swagger UI served at http://' + hostName + ':' + port + swaggerUiRoute);
