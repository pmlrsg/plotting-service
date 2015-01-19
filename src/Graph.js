/**
 * This file has the Graph class. The Graph
 * class is the most used chunk of code.
 * It takes in a plot request from the API
 * and does the downloading of the data and producing
 * of graphs.
 */
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

/**
 * Function that takes in an array of numbers
 * and returns the sum of those numbers
 * @param  Array arr Array of Numbers
 * @return int       Sum of array
 */
function sum( arr ){
	var total = 0;
	
	for( var i in arr )
		total += arr[i];
	
	return total
}
/**
 * Function that takes in an array of numbers
 * and returns the average of those numbers
 * @param  Array arr Array of Numbers
 * @return int       Average value of array
 */
function avg( arr ){
	return sum( arr ) / arr.length
}

/**
 * Constructor for the Graph object.
 * Mostly just stores so local variables and
 * gives the code creating the class chance
 * to add add event listeners 
 */
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
* Load all the source handlers from
* the source_handlers directory
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
* @param {Object} OPTIONAL options The options to us to produce the svg
* @param {Function} callback The callback to return the SVG/XML
*/
Graph.prototype.svg = function( options, callback ){
	switch( this.type() ){
		case "hovmollerLat":
		case "hovmollerLon":
			var draw = require( root + '/lib/drawHovmoller' );
			options = extend({
				title: this._request.plot.title,
			}, options);
			return draw.svg( this.type(), this.json().series, options, callback );
		default:
			callback( new Error( "Could not produce SVG for plot type '"+ this.type() +"'" ) );
	}
}


/**
* Produces the PNG of the graph and send it back in a callback.
*
* @param {int} width The width of the png
* @param {int} height The height of the png
* @param {Object} OPTIONAL options The options to us to produce the png
* @param {Function} callback The callback to return the PNG buffer
*/
Graph.prototype.png = function( options, callback ){
	var draw = require( root + '/lib/drawHovmoller' );
	options = extend({
		title: this._request.plot.title,
	}, options);
	draw.png( this.type(), this.json().series, options, callback );

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