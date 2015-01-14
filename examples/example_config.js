//All times are in seconds

GLOBAL.config = {
	// Stops the suppression of errors
	debug: true,

	// Server port
	port: 3000,
	
	// How long should a job be kept before purging
	job_life_span: 3600,

	// External URL for the server, used for generating
	// Required due to not being able to get the path being proxies
	serverAddress: 'http://pmpc1310.npm.ac.uk/plotting',
	
	// How long should a source handler wait
	// before calculating the estimated completion time
	calculate_estimated_time_after: 5
}

// If not in debug mode, stop the application from crashing on error
if( ! config.debug )
	process.on('uncaughtException', function(err) {
	    logger.log('error', 'Uncaught Exception', { error_message: err.message, error_stack: err.stack });
	});

// Winston is used to record and print logs
var winston = require( 'winston' );
var transports = [
	new (winston.transports.Console)({ json : true, timestamp : true, level : 0, colorize : true, stringify : function(meta){return JSON.stringify(meta, null, 3);}})
];

// Save logs to file
if( ! config.debug )
	transports.push(new (winston.transports.File)({ filename: 'somefile.log' }));

GLOBAL.logger = new (winston.Logger)({
    transports: transports
});
