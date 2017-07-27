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
    host: hostName + 
      (process.env.NODE && ~process.env.NODE.indexOf("heroku")) ? '' : (':' + port),
    basePath: '/'
  },
  apis: ['./server.js']
});

var app = express();

// body-parser is used to parse the POST parameters
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Returns a promise that retrieves raw compositions data from
// the digitraffic REST API for the trains in the rawTrainsData
// array
const promiseRawCompositions = function(rawTrainsData) {
  const rawCompositionsUrls = 
    rawTrainsData.map(rawTrain => 
      compositionsApiUrl + '/' + rawTrain.trainNumber + '?departure_date=' + rawTrain.departureDate);

  console.log('rawCompositionsUrls:' + rawCompositionsUrls);

  var rawCompositionsPromises = rawCompositionsUrls.map((url) => {
    return request.get({
        url: url,
        json: true,
        headers: {'User-Agent': 'request'}
      });
  });

  return Promise.all(rawCompositionsPromises)
};

// Returns the final compositions data array based on the
// rawCompositions in digitraffic API format.
const createCompositionsData = function(rawCompositions) {
  // Create result composition data
  const compositionsData = rawCompositions.map((rawComposition) => { 
    if (!rawComposition || !rawComposition.journeySections) {
      // Don't reject the whole query, if some train doesn't have
      // composition information (e.g. cargo trains don't have)
      return undefined;
    } else {
      return rawComposition.journeySections.map((journeySection) => {
        return {
          from: journeySection.beginTimeTableRow.stationShortCode,
          to: journeySection.endTimeTableRow.stationShortCode,
          wagons: journeySection.wagons,
          locomotives: journeySection.locomotives
        };
      });              
    } 
  })

  return compositionsData;
};

// Main algorithm: Sends a JSON response to the resApi.
//
// 1. Input processing, convert string of numbers into array of numbers
// 2. Get the live-trains data from digitraffic
// 3. Filter the live-trains data to contain only the queried train numbers
// 4. Get the compositions data from digitraffic using the departure dates from the filtered live-trains data
//    - Current date could also be used, but using retrieve departure date is probably more robust for handling 
//      trains that travel over midnight
// 5. Format the final result compositions data
// 6. Format and return the final response by zipping the train data with the compositions data
const trainComposition = function(stationShortCode, trainNumberString, resApi) {

  // 1. Input processing, convert string of numbers into array of numbers
  const trainNumbers = trainNumberString.split(',').map(Number);
  console.log('Query station:' + stationShortCode);
  console.log('Query train numbers:' + trainNumbers);

  // 2. Get the live-trains data from digitraffic
  const rawTrainsUrl = liveTrainsApiUrl + '?station=' + stationShortCode;
  const rawTrainsDataPromise = 
    request.get({
        url: rawTrainsUrl,
        json: true,
        headers: {'User-Agent': 'request'}
      })
      .then(fullRawTrainsData => {
        // 3. Filter the live-trains data to contain only the queried train numbers
        console.log('Live trains query results:' + fullRawTrainsData);
        return fullRawTrainsData.filter(rawTrain => trainNumbers.includes(rawTrain.trainNumber));
      });

  // 4. Get the compositions data from digitraffic
  const compositionsDataPromise = 
    rawTrainsDataPromise
    .then(rawTrainsData => {
      return promiseRawCompositions(rawTrainsData);
    })
    .then(rawCompositionsData => {
      // 5. Format the final result compositions data
      console.log('Compositions query results:' + rawCompositionsData);

      return createCompositionsData(rawCompositionsData);
    });

  // 6. Format and return the final response by zipping the trains data with
  // the compositions data
  return Promise.all([rawTrainsDataPromise, compositionsDataPromise])
    .then(values => {
      // Bluebird's spread function would be cleaner, 
      // but since I started with built-in Promises, 
      // let's stick to them.
      const rawTrainsData = values[0];  
      const compositionsData = values[1];

      return rawTrainsData.map((rawTrain, index) => {
        return {
          departureDate: rawTrain.departureDate,
          trainName: rawTrain.trainType + rawTrain.trainNumber,

          // The time table rows are ordered by the train's route
          departureStation: rawTrain.timeTableRows[0].stationShortCode, 
          destinationStation: rawTrain.timeTableRows[rawTrain.timeTableRows.length - 1].stationShortCode,

          composition: compositionsData[index]
        }
      });
    })
    .then(resultData => {
      console.log('Query response:' + JSON.stringify(resultData));
      resApi.json(resultData);      
    })
    .catch((err) => {
      console.log('Failed to retrieve data:', err);
      // Return error with the same status as the wrapped interface
      resApi.status(err.statusCode).send({ error: 'Failed to retrieve data'});
    });
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
 *         type: object
 *         description: Wagon information as JSON returned by the digitraffic API. See https://rata.digitraffic.fi/api/v1/doc/index.html#Kokoonpanovastaus .
 *       locomotives:
 *         type: object
 *         description: Locomotive information as JSON returned by the digitraffic API. See https://rata.digitraffic.fi/api/v1/doc/index.html#Kokoonpanovastaus .
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
app.post('/train-composition', (req,res) => {
  return trainComposition(req.body.stationShortCode, req.body.trainNumber, res)
});

app.use(swaggerUiRoute, swaggerUi.serve, swaggerUi.setup(swaggerSpec, true));

app.listen(port);

console.log('TRAINS API server started at http://' + hostName + ':' + port + '/');
console.log('Swagger UI served at http://' + hostName + ':' + port + swaggerUiRoute);
