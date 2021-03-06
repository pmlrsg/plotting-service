# Graphing server

Server to remotely render graphs from various datasets in various formats.

## Requirements

* Node.js - [http://nodejs.org](http://nodejs.org)
* GCC Compiler - the d3 node module uses jsdom which requires a C++ compiler:
[https://github.com/tmpvar/jsdom#contextify](https://github.com/tmpvar/jsdom#contextify)

## Install
- npm install
- cp example_config.js config.js
- Edit config.js changed the `serverAddress`
- Start with `node app.js`

## Getting Started

* Clone the repo
* Install dependencies with `npm install`
* Run development server with `node app` and go here:
[http://localhost:3000/](http://localhost:3000/)

### Running node perpetually

For more information about running node perpetually can be found in the [extras](https://github.com/pmlrsg/plotting-service/tree/master/extras) folder.