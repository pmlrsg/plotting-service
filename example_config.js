//All times are in seconds

GLOBAL.config = {
	debug: true,
	port: 3000,
	
	// How long should a job be kept before purging
	job_life_span: 3600,
	serverAddress: 'http://rsg.localhost/plotting/',
	nvd3Path: __dirname + '/lib/nvd3/',
	cache: __dirname + '/cache/',
	
	// How long should a source handler wait before calculating the estimated time
	calculate_estimated_time_after: 5
}

if( ! config.debug )
	process.on('uncaughtException', function(err) {
	    logger.log('error', 'Uncaught Exception', { error_message: err.message, error_stack: err.stack });
	});


var winston = require( 'winston' );
var transports = [
	new (winston.transports.Console)({ json : true, timestamp : true, level : 0, colorize : true, stringify : function(meta){return JSON.stringify(meta, null, 3);}})
];

if( ! config.debug )
	transports.push(new (winston.transports.File)({ filename: './app.js.log' }));
	
GLOBAL.logger = new (winston.Logger)({
    transports: transports
});