var fs   = require('fs');
var util = require('util');
var EventEmitter = require('events').EventEmitter;
var extend = require('node.extend');
var EJS = require('ejs');
var Lateral = require( 'lateral' ).Lateral;
var Sequence = exports.Sequence || require('sequence').Sequence;
var Domain = require('domain');
var Phantom = require('phantom');


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
fs.readdir('./source_handlers/', function(err, files){
	if( err ) throw err;
	files.forEach(function( file ){
		var handler = require( '../source_handlers/' + file );
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
		
		//Put it into testing allowing the front end to serve requests for this job.
		_this.emit('testing');
		
		// Test the data
		_this.loadGraphInPhantomPage(function( page ){
			page.evaluate(function(){
				var results = {
					validation: window.testData(),
					graphComplexity: document.querySelectorAll('path').length
				};
				
				return results;
				
			}, function( results ){
				var errorResult = results.validation[0];
				var errorMessage = results.validation[1];
				page.exitPhantom();
				
				if( errorResult === true ){
					_this._graphComplexity = results.graphComplexity;
					_this.emit( 'complete' );
				}else{
					throw new Error("Validating the data in the series failed: " + errorMessage);
				}
			})
			
		});
		
	})
	
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
	
	_this.sourceHandlers = [];
	
	var eachDataSource = function( complete, item, i ){
		
		logger.log('info', 'Getting data source ' + item.handler, { request: item });
		
		//Get the handler for the data type
		if( source_handlers[ item.handler ] === void(0) )
			throw new Error( "Handler " + item.handler + "is not found. Options are : " + Object.keys( source_handlers ) );
		
		var handler = new (source_handlers[ item.handler ])( _this._type , item);
		
		_this.sourceHandlers.push( handler );
		
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
	
	// Once all the requests have finished
	lateral.then(function(){
		_this._series.sort(function( seriesA, seriesB ){
			return seriesA.key.localeCompare( seriesB.key );
		});
		_this.emit( 'series-ready' ); 
	});
	
	return this;
}
 

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
* @param {Function} callback The callback to return the SVG/XML
*/
Graph.prototype.svg = function( callback ){
	callback( 'deving....' );
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
	fs.readFile(  './graphs/' + this._type + '.js' , function read(err, data) {
	   if( err ){
	   	err.message = 'Could not find correct graph type \n -- ' + err.message;
	   	throw err;
	   }
	    //Render it will the settings
	    var graphJavascript = EJS.render(data.toString(),  settings );
		
		//Get the HTML template
		fs.readFile(  './graphs/template.html' , function read(err, data) {
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


Graph.prototype.svg = function( callback, width, height ){
	logger.log('info', 'Generating svg', { job_id : Domain.active.job.id(), width : width, height: height });
		
	var _this = this;
	
	var width = width || this.width();
	var height = height || this.height();
	
	var sequence = Sequence.create();
	var data = {};
	
	//Get the active domain, some functions bellow need to be rewraped
	var domain = Domain.active;
	
	sequence
		
		.then(domain.bind(function( next ){
			_this.loadGraphInPhantomPage(function( page ){
				data.page = page;
				next();
			},width, height);
		}))
		
		/**
		* Gets the nv.d3.css file so that we can inject it into the SVG later
		*/
		.then(function( next ){
			//logger.log('info', 'Reading nv.d3.min.css', { job_id : _this.id() });
			
			//Readfile needs the domain reset
			fs.readFile(config.nvd3Path + 'nv.d3.min.css', domain.bind(function(err, css ){
				if (err){
					err.message  =  "Could not read nv.d3.min.css for SVG converstion \n--" +err.message
					throw err;
				}
				data.css = css;
				next();
			}))
		})
		/**
		* Pulls the SVG out of the phantom page.
		*  - Also adds the style sheet INSIDE the SVG because nv.d3 uses an external sheet by default
		*/
		.then(domain.bind(function( next ){
			
			data.svg = data.page.evaluate(function( css ){
			
				//String is converted into array of ints for some reason ?
				css = css.map(function( charCode ){ return String.fromCharCode(charCode); }).join("");
				
				//Insert style into the SVG element
				var element = document.querySelector('svg');
				
				var styleElement = document.createElementNS("http://www.w3.org/2000/svg", "style");
				styleElement.setAttribute('type', "text/css");
				styleElement.textContent = css;
				element.appendChild(styleElement)
				
				//Return the SVG
				return document.body.innerHTML;
				
			}, function( result ){
				// Check the return is a string of at least 20
				if( typeof result != 'string' || result.length < 20  )
					throw new Error("SVG failed to render in PhantomJs");
					
				data.svg = result;
				data.page.exitPhantom();
				next();
			}, data.css);
		}))
		
		
		/**
		* SUCCESS
		*/
		.then(domain.bind(function( next ){
			callback( data.svg );
			next();
		}))

};






/**
* Return the path to a png of the graph with the required width and height
*
* @param {int} width Width of the image in pixels
* @param {int} height Height of the image in pixels
* @param {Function} callback A callback which will be passed 1 paramater with which be the absoulte path to the new file.
*/
Graph.prototype.png = function( callback, width, height ) {
	logger.log('info', 'Generating png', { job_id : Domain.active.job.id() });
		
	var _this = this;
	
	var width =  width || this.width();
	var height = height || this.height();
	
	var sequence = Sequence.create();
	var data = {};
	
	sequence
		.then(function( next ){
			_this.loadGraphInPhantomPage(function( page ){
				data.page = page
				next();
			},width, height)
		})
		
		/**
		* Returns a path to store a temporary file
		*/
		.then(function( next ){
			_this.job().tmpFile(function ( pngPath ) {
				data.pngPath = pngPath;
				next();
			}, 'png');
		})
		
		/**
		* Pulls the SVG out of the phantom page.
		*  - Also adds the style sheet INSIDE the SVG because nv.d3 uses an external sheet by default
		*/
		.then(function( next ){
			data.page.render( data.pngPath, function(){
				next();
			});
			
		})
		
		/**
		* SUCCESS
		*/
		.then(function( next ){
			callback( data.pngPath );
				data.page.exitPhantom();
			next();
		})

};




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
	
	var sources = this.sourceHandlers.map(function( handler ){
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



module.exports = Graph;