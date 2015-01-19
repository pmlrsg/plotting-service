//polutes the globally goodness
require( __dirname + '/app/config/config.js');

GLOBAL.root = __dirname;
GLOBAL.loopback = 'http://localhost:' + config.port;

// Standard librarys
var express = require('express');
var app = express();

// Load the configs
require( root + '/app/config/express' )( app );
require( root + '/app/routes' )( app );

// Manager classes stores and looks after job
var Manager = require('./src/Manager');
var manager = new Manager();
GLOBAL.manager = manager;

// Clean up on crash
process.on('exit', function() {
	manager.removeAllJobs();
});

// Attach the routes to the application
require( __dirname + '/app/routes' )( app );

/**
* Start the server on port {config.port}
*/
app.listen(config.port);

logger.log('info', 'Server start on port ' + config.port);
