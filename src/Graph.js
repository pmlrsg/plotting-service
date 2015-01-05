var fs   = require('fs');
var util = require('util');
var EventEmitter = require('events').EventEmitter;
var extend = require('node.extend');
var EJS = require('ejs');
var Lateral = require( 'lateral' ).Lateral;
var Sequence = exports.Sequence || require('sequence').Sequence;
var Domain = require('domain');
var Phantom = require('phantom');
var request = require('request');


function phantomPage( callback ){
	Phantom.create(function(ph){
		setTimeout(function(){
			ph.exit();
		}, 60000);

		ph.createPage(function( page ){
			page.exitPhantom = function(){
				ph.exit();
			};
			callback( page );
		})
	})
		
}

function sum( arr ){
	var total = 0;
	
	for( var i in arr )
		total += arr[i];
	
	return total
}
function avg( arr ){
	return sum( arr ) / arr.length
}


var Graph = function ( request ) {
	EventEmitter.call( this );
	
	//Request data
	this._data = null;
	this._type = request.plot.type;
	this._request = request;
	this._series = [];
	this._groups = [];
	this._width = 800;
	this._height = 600;
	
	// What element should it be in in the dom
	this._containerId = "graph-" + Math.floor(Math.random() * 10000); 
}

util.inherits(Graph, EventEmitter);


var source_handlers = {};
/**
* Get all the valid handlers
*/
fs.readdir(__dirname +'/../source_handlers/', function(err, files){
	if( err ) throw err;
	files.forEach(function( file ){
		var handler = require( __dirname +'/../source_handlers/' + file );
		source_handlers[ handler.apiName() ] = handler;
		logger.log( 'info', 'Loaded source handler: ' + handler.apiName() );
	})
})




/**
* Takes in a request and setups up the graph.
*
* @param {Object} data The request object to build the graph
* @param {Function} callback Called when the graph has been setup. Passes back 
*/
Graph.prototype.init = function(  ) {
	var _this = this;
	
	this.on('series-ready', function(){
		_this.emit( 'complete' );
	});
	
	this.getDataSources( this._request.plot.data.series );
	
	return this;
};

/**
* Takes the series data from the request and collects the data from the needed sources.
* After it emits a "series-ready" event an array of series ready to use
*
* @param {Object} series The series data from the reuqest
*/
Graph.prototype.getDataSources = function( series ){
	var maxCallsAtOnce = 100;
	var _this = this;
	_this._series = [];
	
	_this._sourceHandlers = [];
	
	var eachDataSource = function( complete, item, i ){
		
		logger.log('info', 'Getting data source ' + item.handler, { request: item });
		
		//Get the handler for the data type
		if( source_handlers[ item.handler ] === void(0) )
			throw new Error( "Handler " + item.handler + "is not found. Options are : " + Object.keys( source_handlers ) );
		
		var handler = new (source_handlers[ item.handler ])( _this._type , item);
		
		_this._sourceHandlers.push( handler );
		
		//When the source handler has data, mark the lateral handler as done
		handler.on('series-ready', function(){
			_this._series = _this._series.concat( handler.series() );
			_this._groups = _this._groups.concat( handler.groups() );
			complete();
		});
	};
	
	//Make a lateral request handler
	var lateral = Lateral.create(eachDataSource, maxCallsAtOnce);	

	lateral.add( series );
	
	function strcmp ( str1, str2 ) { 
		return ( ( str1 == str2 ) ? 0 : ( ( str1 > str2 ) ? 1 : -1 ) );
	};
	
	// Once all the requests have finished
	lateral.then(function(){
		_this._series.sort(function( seriesA, seriesB ){
			return strcmp(seriesA.key, seriesB.key );
		});
		_this.emit( 'series-ready' ); 
	});
	
	return this;
}


/**
* Returns the JSON data needed for the page to be built
*/
Graph.prototype.json = function(){
	
	return {
		series : this._series,
		groups : this._groups,
		request: this._request,
	};
	
}



////////////////////////////////////////////////
////////////////// Totally not needed bellow

/**
* Returns the HTML to produce a interactive graph.
* Includes tags html, body, head, etc....
*  - Caches results
*
* @param {Function} callback The callback to return the HTML
*/
Graph.prototype.interactiveHtml = function( callback ){
	if( this._interactiveHtml !== void(0) )
		return callback( this._interactiveHtml );
	
	var _this = this;
	this.html(function( html ){
		_this._interactiveHtml = html;
		callback( html );
	}, {
		interactive : true
	});
}

/**
* Returns the HTML to produce a interactive graph.
* Includes tags html, body, head, etc....
*  - Caches results
*
* @param {Function} callback The callback to return the HTML
*/
Graph.prototype.noninteractiveHtml = function( callback ){
	if( this._noninteractiveHtml !== void(0) )
		return callback( this._noninteractiveHtml );
	
	var _this = this;
	this.html(function( html ){
		_this._noninteractiveHtml = html;
		callback( html );
	},
	// Settings for the HTML generator
	{
		interactive : false
	});
}





/**
* Produces the SVG of the graph and send it back in a callback.
* Includes tags html, body, head, etc....
*  - Caches results
*
* @param {int} width The width of the svg
* @param {int} height The height of the svg
* @param {String} OPTIONAL state The state to us to produce the svg
*                          		State is currently not used but will
*                          		be in the future
* @param {Function} callback The callback to return the SVG/XML
*/
Graph.prototype.svg = function( width, height, state, callback ){
	switch( this.type() ){
		case "hovmollerLat":
		case "hovmollerLon":
			var draw = require( root + '/lib/drawHovmoller' );
			return draw( this.type(), this.json().series, width, height, callback );
		default:
			callback( new Error( "Could not produce SVG for plot type '"+ this.type() +"'" ) );

	}
}


/**
* Produces the PNG of the graph and send it back in a callback.
*
* @param {int} width The width of the png
* @param {int} height The height of the png
* @param {String} OPTIONAL state The state to us to produce the png
* @param {Function} callback The callback to return the PNG buffer
*/
Graph.prototype.png = function( width, height, state, callback ){
	
   // Paramaters for the request
   var paramaters = {
      method: 'POST',
      url: loopback + '/svg-to/png',
      form: { svg: null },
      encoding: null // tells request to return a Buffer as body
   };

   // Callback to the add the png to the archive
   var pngCallback = function( err, httpResponse, body ){
      if( err )
      	callback( err );
      else
	      callback( null, body );
   };

   // Callback with thew svg
   var svgCallback = function( err, svg ){
      if( err )
      	return callback( err );
      
      // Convert the SVG into a png
      paramaters.form.svg = svg;
   	request( paramaters, pngCallback );
   };

   this.svg( width, height, state, svgCallback );

}

/**
* Makes the HTML to to produce the graph.
*
* The HTML can be pased to the client to render in an iframe
*	or put inside phantomJS for turn into a PNG / extract the SVG.
*	For extraction set `interactive` to false
*
* @param {Function} callback The callback to return the HTML
* @param {Obj} setting Settings to change the HTML {
*   interactive: (true|false) // interactive maps have the focus bar. Non interactive are for screenshoting
* }
*/
Graph.prototype.html = function(callback, settings ){
	
	var defaultSettings = {
		interactive : true, 
		series : this._series,
		groups : this._groups,
		request: this._request,
		width: this._width,
		height: this._height,
	};
	
	settings = extend( defaultSettings , settings );
	
	// Get the graph javascript
	fs.readFile( root +'/public/' + this._type + '.js' , function read(err, data) {
	   if( err ){
	   	err.message = 'Could not find correct graph type \n -- ' + err.message;
	   	throw err;
	   }
	    //Render it will the settings
	    var graphJavascript = EJS.render(data.toString(),  settings );
		
		//Get the HTML template
		fs.readFile( root +'/app/views/template.ejs' , function read(err, data) {
			if( err ){
				err.message = 'Could not find graph template \n -- ' + err.message;
				throw err;
			}
			
			//Render it and send it back
			var html;
			settings.graphJavascript = graphJavascript;
			html = EJS.render(data.toString(), settings );
			
			callback( html );
	    });
	});
	
	
}


Graph.prototype.loadGraphInPhantomPage = function( callback, width, height ){
	
	var sequence = Sequence.create();
	var data = {};
	
	var domain = Domain.active;
	
	sequence
		/**
		* Creates a page in phantom and sets its view port
		*/
		.then(domain.bind(function( next ){
			//logger.log('info', 'Generating phantom page', { job_id : _this.id() });
			phantomPage(domain.bind(function (page) {
				
				//Set up the page
				data.page = page;
				data.page.set('viewportSize',{
					width: width,
					height: height
				});
				
				//Log any JS errors on the page
				data.page.set('onError', domain.bind(function(msg, trace) {
					var msgStack = [ new Error('NODE ERROR (in phantom):'), 'PHANTOM ERROR: ' + msg];
					
					if (trace && trace.length) {
						msgStack.push('TRACE:');
						trace.forEach(function(t) {
							msgStack.push(' -> ' + t.file + ': ' + t.line + (t.function ? ' (in function "' + t.function +'")' : ''));
						});
					}
					throw new Error(msgStack.join('\n'));
				}));
				
				//Error if resources fail to load
				data.page.set('onResourceError', domain.bind(function(resourceError) {
					throw new Error("Could not load PhantomJS resource: " + resourceError.url);
				}));
				/*
				//Detect when the graph has finished loading
				data.page.set('onConsoleMessage' , domain.bind(function(msg) {
					if( msg == "graph-loaded" )
						next();
				}));
				*/
				//Load the noninteractive graph
				data.page.open( config.serverAddress + '/job/' + domain.job.id() + '/noninteractive' , function(status) {
					next();
				});
			}));
		}))
		
		/**
		* Return the page
		*/
		.then(function(){
			callback( data.page );
		})
	
}




/**
* Calculate the current progress.
*
* @return {Object} {
*		percentage : {float} Perctent completed
*		timeElapsed : {float} Time thats pased sense the start in seconds
*		estimatedCompletionTime : {float} Time estimated time in seconds
*		isTimeCalculatable : {boolean} Was we able to calculate a proper estimate
*	}
*/
Graph.prototype.progress = function() {
	
	var sources = this._sourceHandlers.map(function( handler ){
		var data = {
			sourceName: handler.sourceName(),
			percentage: handler.percentage(),
			startTime: handler.startTime(),
			estimation: handler.estimationStatus()
		};
		
		if( handler.hasFinished())
			data['endTime'] = handler.endTime();
		
		return data;
		
	})
	
	return {
		percentage : avg( sources.map( function(d){ return d.percentage; } ) ) ,
		sources: sources,
		graphComplexity: this._graphComplexity
	};
};

//---------------------
// Getters and setters
Graph.prototype.job = function(_){
	if( !arguments.length ) return this._job;
	this._job = _;
	return this;
}


Graph.prototype.width = function(_) {
	if (!arguments.length) return this._width;
	this._width = _;
	return this;
};
Graph.prototype.height = function(_) {
	if (!arguments.length) return this._height;
	this._height = _;
	return this;
};


Graph.prototype.type = function(_) {
	if (!arguments.length) return this._type;
	this._type = _;
	return this;
};

Graph.prototype.request = function(_) {
	if (!arguments.length) return this._request;
	this._request = _;
	return this;
};


Graph.prototype.sourceHandlers = function(_) {
	if (!arguments.length) return this._sourceHandlers;
	this._sourceHandlers = _;
	return this;
};





module.exports = Graph;