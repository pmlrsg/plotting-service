//polutes the globally goodness
require('./config.js');

GLOBAL.uuid = (function(){
	var count = 1;
	return function(){
		return Number( (new Date()).getTime() + '.' + (count++)  );
	}
})();


// Standard librarys
var express = require('express');
var app = express();
var url = require('url');
var Domain = require('domain');
var extend = require('node.extend');
var tmp = require('tmp');
var svg2png = require('svg2png');
var Sequence = exports.Sequence || require('sequence').Sequence;
var fs = require( 'fs' );

// Handles the clients requiest to build the graph
var GraphJob = require('./src/GraphJob');

// Manager classes stores and looks after job
var Manager = require('./src/Manager');
var manager = new Manager();
GLOBAL.manager = manager;

// Clean up on crash
process.on('exit', function() {
	manager.removeAllJobs();
});

app.engine('.html', require('ejs').__express);
app.set('views', __dirname  + '/html');
app.set('view engine', 'html');
app.set('trust proxy', ['loopback']);

app.use(function (req, res, next) {
	res.setHeader('Access-Control-Allow-Origin', '*');
	res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
	res.setHeader('Access-Control-Allow-Headers', '*');
	next();
});

app.use(app.router);
//app.use(express.bodyParser());

/**
* Allows Express URL paramaters to accept regex
*/
app.param(function(name, fn){
  if (fn instanceof RegExp) {
    return function(req, res, next, val){
      var captures = fn.exec(String(val));
      if (captures) {
        req.params[name] = captures;
        next();
      } else {
        next('route');
      }
    };
  }
});

// Express URL paramater using regex
app.param('id', /^\d+$/); //job_id
//app.param('fileName', /^[0-9a-zA-Z\-]+$/); 
app.param('returnType', /^(svg|png|noninteractive|interactive)$/); //Export types for graphs


//--------------------------
// TESTING STUFF

app.get('/crossdomain.xml', function(req, res){ return res.sendfile(__dirname +'/crossdomain.xml'); });

//Testing route
app.get('/', function(req, res) {
	res.render('new');
});

//Testing route
app.get('/graphs', function(req, res) {
	res.render('old');
});

//Testing route
app.get('/debug', function(req, res) {
	res.render('debug');
});
app.get('/handlebars.min.js', function(req,res){ return res.sendfile(__dirname +'/html/handlebars.min.js'); });
app.get('/ajax-loader.gif', function(req,res){ return res.sendfile(__dirname +'/html/ajax-loader.gif'); });

//--------------------------


// Codes bases need to build the graph in phantom/iframe
app.get('/es5.js', function(req,res){ return res.sendfile(__dirname +'/graphs/es5.js'); });
app.get('/jquery.min.js', function(req,res){ return res.sendfile(__dirname +'/html/jquery.min.js'); });
app.get('/nv.d3.js', function(req,res){ return res.sendfile(__dirname +'/lib/nvd3/nv.d3.js'); });
app.get('/nv.d3.css', function(req,res){ return res.sendfile(__dirname +'/lib/nvd3/nv.d3.css'); });
app.get('/d3.js', function(req,res){ return res.sendfile(__dirname +'/lib/nvd3/lib/d3.v3.js'); });
app.get('/template.js', function(req,res){ return res.sendfile(__dirname +'/graphs/template.js'); });


function makeDomain( options ){
	options = options || {};
	var domain = Domain.create();
	
	if( options.job != void(0) )
		domain.job = options.job;
		
	if( options.res != void(0) )
		domain.res = options.res;
	
	domain.on('error', function( err ){
		try{
			var meta =  { error_message : err.toString(), error_stack : err.stack };
			
			if(  Domain.active.job != void( 0 ) )
				meta['job_id'] =  Domain.active.job.id();
			
			extend( meta, err.meta || {} );
			logger.log('error',  err.message, meta);
			
			if( Domain.active.res != void( 0 ) ){
				res.send( 500, 'Generating the graph failed:<br>\n' + err.message );
				res.end();
			}
		}catch(e){
			logger.log('error',  "Reporting domain error failed", { error: e });

		};
		domain.dispose();
	});
	return domain;
}

/**
* Takes in a request for a graph an dispactes a job to collect the data
* 
* @return {JSON} Id of the job for polling
*/
app.post('/plot', function(req, res) {

	
	var domain = makeDomain( { res: res } );
	
	var body = "";
	req.on('data', domain.bind(function(data) {
		body += data;
		if (body.length > 5e6)
			req.connection.destroy();
	}));
	
	req.on('end', domain.bind(function() { 
	
		var url_parts = url.parse(req.url, true);
		var query = url_parts.query;
		
		logger.log('info', body);
		
		var post = JSON.parse(body);

		var job = new GraphJob().graphRequest( post );
		manager.addJob( job );
	
		logger.log('info', 'New Job', { job_id : job.id(), request : post });
		
		// Return details about the job
		res.json({
			'job_id': job.id()
		});	
	}));
});



/**
* Returns the current status of a job you requested
* 
* @return {JSON} States of the job you requested
*/
app.get('/job/:id/status', function(req, res) {
	
	var domain = makeDomain( { res: res } );
	
	var handle = function(){
		var job = manager.getJob( req.param( 'id' ).input );
		if( ! job ){
			return res.send(404, {
				'status' : 'error',
				'messsage': 'This job id has not been found on the server.'
			});
		}
		Domain.active.job = job;
		
		var status =  job.status();
		status.job_id = req.param( 'id' ).input;
		res.json( status );
	};
	
	process.nextTick(domain.bind(handle));
});


/**
* Returns the data of the job in the requested format.
* Correct headers are sent to maktch the content type
* 
* @return {Binary} Returns data that suits the Job type
*/
app.get('/job/:id/:returnType', function(req, res) {
	
	
	var domain = makeDomain( { res: res } );
	
	var handle = function(){
		var job = manager.getJob( req.param( 'id' ).input );
		if( !job )
			return res.send( 404, "Job not found" );
			
		Domain.active.job = job;
		
		var returnType = req.param( 'returnType' ).input;
		logger.log('info', 'Serving graph in format ' + returnType , { job_id : job.id(), return_type : returnType });
		
			
		job.serveAnswer( returnType, req , res );
	};
	
	process.nextTick(domain.bind(handle));
});



/**
* Returns the current status of a job you requested
* 
* @return {JSON} States of the job you requested
*/
app.post('/svg-to/:format', function(req, res) {
	
	var domain = makeDomain( { res: res } );
	
	var body = "";
	req.on('data', domain.bind(function(data) {
		body += data;
		if (body.length > 5e6)
			req.connection.destroy();
	}));
	
	req.on('end', domain.bind(handle)); 

	function handle(){
		var format = req.params.format;
		var svgXML = decodeURIComponent(body.substr(4)).replace(/\+/g, ' ');
		switch( format ){
			case "svg":
				res.setHeader('Content-Disposition', 'attachment; filename=image.' + format );
				res.setHeader('Content-Type', 'image/svg+xml;charset=utf-8' );
				res.end(svgXML);
				break;
			case "png":
				res.setHeader('Content-Disposition', 'attachment; filename=image.' + format );
				res.setHeader('Accept-Ranges', 'bytes' );
				res.setHeader('Content-Type', 'image/png' );


				var sequence = Sequence.create();
				var data = {};
				
				sequence
				.then(function(next){
					tmp.file({ postfix: '.svg' }, function _tempFileCreated(err, path, fd) {
					   if (err) throw err;
						data.svgPath = path;
						data.svgFd = fd;
						fs.writeFile(path, svgXML);
						next();
					});
				})
				.then(function(next){
					tmp.file({ postfix: '.png' }, function _tempFileCreated(err, path, fd) {
					   if (err) throw err;
						data.pngPath = path;
						data.pngFd= fd;
						next();
					});
				})
				.then(function(next){
					svg2png(data.svgPath, data.pngPath, function( err ){
						if( err ) throw err;

						res.sendfile( data.pngPath );

						res.on( 'finish', cleanUp );
						res.on( 'close', cleanUp );

					   function cleanUp(){
					   	var callback = function(){};
							fs.unlink( data.svgPath, callback );
							fs.unlink( data.pngPath, callback );

							fs.close( data.pngFd, callback );
							fs.close( data.svgFd, callback );
						}
						
					});
				})
				
				break;
		};
	};
});




/**
* Start the server on port {config.port}
*/
app.listen(config.port);

logger.log('info', 'Server start on port ' + config.port);
