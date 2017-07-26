Trains API
==========

This repository contains a REST API for querying information about train compositions. It uses
internally the digitraffic API available at https://rata.digitraffic.fi/ .

The app is deployed in heroku at https://intense-oasis-92112.herokuapp.com/api-docs/ .

## Usage locally

Use `npm install` to install the required dependencies.

Use `node server` to start up the server.

## API

The Main API is available as POST endpoint at http://localhost:3000/train-composition. 
Its required parameters are specified in JSON body, e.g.:

    { 
      stationShortCode: SLO,  // Specifies the station short code
      trainNumber: 197,194    // Specifies the numbers of the trains to retrieve
    }

More detailed REST API documentation is hosted by the node app itself using Swagger UI. 
It is hosted by default at http://localhost:3000/api-docs/ .

## Information about the implementation

To reach production quality, the following should still be done:

1. Add automatic/unit tests
1. Better error management (messages, error codes)
1. Host the API using HTTPS instead of HTTP
1. Limit the amount of operations done to digitraffic API. Now the implementation starts several composition
queries in parallel which might end up returning errors or timeouting due to limits in the digitraffic API
implementation.
1. Add validation for the input parameters
1. Support also GET operation
1. Support for form parameters
1. Clean up the debug logging
1. Consider sorting the response in the same order as the trainNumber list from user
1. Consider making parameters optional
1. Consider splitting the implementation to couple modules instead of single `server.js` file
