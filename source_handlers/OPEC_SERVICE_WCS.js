var EventEmitter = require('events').EventEmitter;
var util = require('util');
var querystring = require('querystring');
var Domain = require('domain');
var request = require('request');
var memoizee = require( 'memoizee' );
var cachedRequest = memoizee(request,  { async: true });
var Sequence = exports.Sequence || require('sequence').Sequence;
var Lateral = require('lateral').Lateral;

var url = require('url');
var clone = require('clone');
var uid = require('uid');
var csv = require('to-csv');
var imageType = require('image-type');

// Utils
Array.prototype.first = function(){
	return this[0];
}

Array.prototype.last = function(){
	return this[ this.length - 1 ];
}

function capitaliseFirstLetter(string)
{
    return string.charAt(0).toUpperCase() + string.slice(1);
}


/**
* Constructor for the OPEC python data getter/formater
* 
* @param {String} type The type of data to get (timeline|hovermoller|etc...)
* @param {Object} series The series as passed original request
*/
function OPEC_Service( type, series, domain ){
	EventEmitter.call( this );
	
	var _this = this;
	
	this._series = series;
	this._formatedSeries = [];
	this._type = type;

	this._label = this._series.label;
	
	this._estimatedEndTime = null;
	
	this._dataSource = series.data_source;
	
	// Data end points
	this._metaCacheUrl =  series.data_source.metaCacheUrl;
	this._threddsUrl = series.data_source.threddsUrl;
	this._middlewareUrl = series.data_source.middlewareUrl;
	// Track how we are 
	this._estimationStatus = {
		state: 'not started',
		message: 'Not started'
	};
	
	//Used for progress
	this._startTime = new Date();
	this._series_ready = false;
	
	var domain = Domain.active;
	
	this.calculateEstimatedEndTimeAfterWait();
	
	var url = this.buildSourceUrl( this._dataSource );
	logger.log( 'info', 'Getting URL ' + url, { job_id: domain.job.id() } );
	
	// Send the request to get the data
	cachedRequest( 
		url , 
		domain.bind(function (err, response, body) {
			
			if (err || response.statusCode != 200){
				if( ! err )
					switch( response.statusCode ){
						case 400:
							err = new Error("There was no data in your request area.");
							break;
						default:
							err = new Error("Invalid status code " + response.statusCode);
					   	break;
					}
					err.message = 'Server did not return a valid reply :  \n -- ' + err.message;   	
			   	err.meta = { reply : body, url: url }
			   	throw err;
		   }
		   
		   // Read and process the output
			_this._data = JSON.parse( body ).output.data;
			_this.makeSeries();
			_this.emit('series-ready');
			_this._series_ready = true;
			_this._endTime = new Date();
		})
	)
	
	
	
	//Back date complete events
	this.on('newListener', function( event, func ){
		if( event == 'series-ready' && _this._series_ready )
			func();
	})
}

util.inherits(OPEC_Service, EventEmitter);

/**
* The name used to identify this in API calls
*/
OPEC_Service.apiName = function(){
	return "OPEC_SERVICE_WCS";
}

/**
* Calls the function to make the correct series from the downloaded data
*/
OPEC_Service.prototype.makeSeries = function(){
	this.seriesFormatters[ this._type.toLowerCase() ].call(this);
}



OPEC_Service.prototype.seriesFormatters = {};

/**
* Makes the series' in the hovmoller latitude  format
* Uses the downloaded data.
*/
OPEC_Service.prototype.seriesFormatters['hovmollerlat'] = hovmoller = function(){

	this._formatedSeries = [];
	this._formatedGroups = [];

	this._formatedSeries.push({
		values: this._data,
      meta: this._series.meta,
      key: uid(),
		label : this._series.label, //graph name

	});
};


OPEC_Service.prototype.seriesFormatters['hovmollerlon'] = hovmoller;

/**
* Makes the series' in the time line format
* Uses the downloaded data.
* 
* Takes the download data and loops over the date points pulling out the need values
* From this it builds new series that can be used in the actaul graph.
*/
OPEC_Service.prototype.seriesFormatters['timeseries'] = Timeseries = function(){
	this._formatedSeries = [];
	this._formatedGroups = [];
	groupKey = uid();

	this._formatedGroups.push( {
      groupLabel: this._series.label,
      groupKey: groupKey,
      meta: this._series.meta
   } );
	
	// Timeseries requests contain multiple Y points
	// Extract each point and move it to its own series
	var defaltVariables = ['mean'];
	var variableKeys = [ 'std', 'min', 'max', 'median', 'mean' ];
	for( var variableKeyId = 0; variableKeyId < variableKeys.length; variableKeyId++ ){
		
		var variable = variableKeys[variableKeyId];
		
		//Make a new series
		var newSeries = {
			label : this._series.label + ' ' + variable, //graph name
			key: uid(),
			type : 'line', //graph type (line|bar|etc...)
			yAxis : this._series.yAxis, //graph axis
			disabled : defaltVariables.indexOf( variable) == -1,
			values: [] // place to store the points
		};

		newSeries.groupKey = groupKey,
		newSeries.groupLabel = variable
		
		//Loop over the downloaded points extracting the Y value needed
		for( var i in this._data ){
			var point = {
				x : i, // x axis,
				y : this._data[ i ][ variable ] // y axis
			};
			
			
			newSeries.values.push( point );
		}
		
		newSeries.values.sort(function( pointA, pointB ){
			return ( new Date( pointA.x ) ).getTime() > ( new Date( pointB.x ) ).getTime() ? 1 : -1 ;
		})
		
		//Add the new series to the list of others
		this._formatedSeries.push( newSeries );
	}
}

/**
* Builds the URL to get the data needed from the server
* 
* @return {String} The full URL
*/
OPEC_Service.prototype.buildSourceUrl = function( dataSource ){
	var queryData = {};
	
	queryData.baseurl = dataSource.threddsUrl;
	queryData.coverage = dataSource.coverage;
	queryData.type = this._type;
	
	if( dataSource.graphXAxis )
		queryData.graphXAxis = dataSource.graphXAxis;
	
	if( dataSource.graphYAxis )
		queryData.graphYAxis = dataSource.graphYAxis;
	
	if( dataSource.graphZAxis )
		queryData.graphZAxis = dataSource.graphZAxis;

	queryData.time = dataSource.t_bounds.map(function( dateString ){
		var date = new Date( dateString );
		return date.toISOString();
	}).join( '/' );
	
	queryData.bbox = dataSource.bbox;
	queryData.depth = dataSource.depth;

	if( typeof dataSource.bbox == 'string' ){
		if( dataSource.bbox.match(/POLYGON/i) )
			queryData.isPolygon = true;
		if( dataSource.bbox.match(/LINESTRING/i) )
			queryData.isLine = true;
	};

	
	var url =  this._middlewareUrl + "?" + querystring.stringify( queryData );
	
	return url;
}


/**
* Returns the series ready to be inserted into the graph built
* @return {Object[][]}  The array of series arrays
*/
OPEC_Service.prototype.series = function(){
	return this._formatedSeries;
}


OPEC_Service.prototype.groups = function(){
	return this._formatedGroups;
}


OPEC_Service.prototype.sourceName = function(){
	return this._dataSource.coverage;
}


OPEC_Service.prototype.resourceCsv = function( archiver, folderName, callback){
	var titles = {
		datetime: "Date",
		min: "Min",
		max: "Max",
		mean: "Mean",
		median: "Median",
		std: "Standard Deviation",
	};
	var rows = [];
	for( var i in this._data ){
		var row = this._data[i];
		row.datetime = i;
		rows.push( row );
	}
	rows.sort(function( a, b ){
		return new Date( a.datetime ) - new Date( b.datetime ); 
	});

	var csvStr = csv( [titles].concat( rows ), {
		headers: false
	});

	archiver.append( csvStr, { name: folderName + 'data.csv' } );

	callback();
}

OPEC_Service.prototype.resourceMetaData = function( archiver, folderName, callback){
	var metaData = this._series.meta;
	if( !( this._series.markdown instanceof Array ) || this._series.markdown.length == 0 )
		finish();

	var lateral = Lateral.create(function( complete, item, i ){
		request({
			url: item,
		}, function( err, response, body ){
			if( ! err  && response.statusCode == 200){
				metaData += "<br><br>";
				metaData += body;
			}
			complete();
		});
	}, 5);
	lateral.add( this._series.markdown );

	lateral.then(finish);
	
	function finish(){
		archiver.append( metaData, { name: folderName + 'meta-data.html' } );
		callback();
	}
}

OPEC_Service.prototype.resourceLogos = function( archiver, folderName, callback){
	var metaData = this._series.meta;

	request({
		url: this._series.logo,
		encoding: null,
	}, function( err, response, body ){
		if( ! err && response.statusCode == 200){
			var ext = 'png';
			archiver.append( body, { name: folderName + 'logo.' + imageType( body ) } );
		};
		callback();
	});
}


/**
 * Returns a zip of folders containing the request resources
 * @param  {Array} resources The resources you need
 * @param  {Function} callback The call back with the zip data
 * @return {ZipFIle)           The zip of files
 */
OPEC_Service.prototype.addResourcesToArchive = function( resources, archive, callback){
	if( ! ( resources instanceof Array ) )
		return callback();

	var changeCase = require('change-case');
	var _this = this;
	var total = 0;
	var count = 0;
	var stillAdding = true;
	var folderName = this._label + '/';
	// For each resource tell them to put the resource in the zip
	resources.forEach(function( resource ){
		var functionName = changeCase.camel( 'resource-' + resource  )
		if( _this[functionName] instanceof Function ){
			total++;
			_this[functionName]( archive, folderName, resourceCollected );
		}
	});

	stillAdding = false;
	function resourceCollected(){
		count++;
		if( count == total && stillAdding == false )
			callback( archive );
	}

	// Callback now because nothing was asked for
	if( total == 0 || ( count == total && stillAdding == false ) )
		callback( archive );

}



////////////////////////////// ALL THIS BELLOW NEEDS REDOING


/**
* Waits for X amount of seconds before calculating the estimated time
* 	- Calculating the time takes an extra 2 requests.
*/
OPEC_Service.prototype.calculateEstimatedEndTimeAfterWait = function(){
	var waitFor = config.calculate_estimated_time_after * 1000;
	var _this = this;
	
	setTimeout(function(){
		if( ! _this._series_ready )
			_this.calculateEstimatedEndTime();
	}, waitFor)
}

/**
* Calculates the estimated to complete the download
*
* Function:
*	Downloads the meta data to get time slices
*	Times the download of 1 time slice
*	Return the time of 1 slices multipled by the number of slices
* 
* This function works because processing the graph data is linear over different time bounds.
* Errors are logged but do not leave this function.
*/
OPEC_Service.prototype.calculateEstimatedEndTime = function(){
	if( this._isCalculatingEstimatedEndTime )
		return;
	
	this._isCalculatingEstimatedEndTime = true;
	
	this._estimationStatus = {
		state: 'calculating',
		message: 'Calculating',
	}
	
	if( typeof this._metaCacheUrl != 'string' )
		return;
	
	//Create a new domain so if this errors we dont kill the job process
	var job = Domain.active.job;
	var domain = Domain.create();
	domain.job = job;
	
	domain.on('error', function( err ){
		_this._estimationStatus = {
			state: 'error',
			message: err.message
		}

		logger.log( 'error', 'Error when calculating estimate' , { job_id : domain.job.id(), error_stack: err.message, error_stack: err.stack  } );
	})
	
	var sequence = Sequence.create();
	var data = {};
	data.timeSliceSampleSize = 20;
			data.pingTime = 50;
	var _this = this;
	
	
	sequence
		
		/**
		* Get the meta data for the indicator
		* This will give is the time slices so we know what to sample
		*/
		.then(domain.bind(function(next){
			
			_this._estimationStatus = {
				state: 'calculating',
				message: 'Calculating: Fetching meta data',
			}
	
			cachedRequest(
				_this._metaCacheUrl,
				Domain.active.intercept(function( response, body ){
					
					//Parse the result and pull out the t_bounds
					var result = JSON.parse( body );
					var lower = new Date(_this._dataSource.t_bounds.first());
					var upper = new Date(_this._dataSource.t_bounds.last());
					
					var timeDimension = null;
					for( var i in result.Dimensions ){
						if( result.Dimensions[i].Name == 'time' )
							var timeDimension = result.Dimensions[i];
					}
					
					if( timeDimension == null )
						throw new Error('No time dimension in meta data');
					
					//Get the dates that are in a valid range from the users request.
					// Also sort them.
					data.timeSlicesInRange = timeDimension.Value
						//Get the times in an array
						.split(',')
						// Convert the str times to Date objects
						.map(function( strTime ){
							return new Date( strTime )
						})
						// Filter out the Dates out of the needed rage
						.filter(function( date ){
							if( date == null ) return false;
							
							if( lower < date && date < upper )
								return true;
							else
								return false;
						}).sort(function( a , b ){
							return a > b ? 1 : -1
						});
					
					next();
				})
			);
		}))
		.then(domain.bind(function(next){
			
			_this._estimationStatus = {
				state: 'calculating',
				message: 'Calculating: Running sample query',
			}
	
			// Check if its worth doing the sample size first
			// If the sample is more then 20% of the actauly request its not worth the query
			if( data.timeSlicesInRange < data.timeSliceSampleSize.length * 5 ){
			
				_this._estimationStatus = {
					state: 'error',
					message: 'Not worth computing estimate.'
				}
			}
			
			//Get the time slices we should test
			var datesToSample = data.timeSlicesInRange.splice( 0, data.timeSliceSampleSize );
			
			// Produce a new smaller query
			var dataSource = clone( _this._dataSource );
			dataSource.t_bounds = [ datesToSample.first().toISOString() , datesToSample.last().toISOString() ];
			var url = _this.buildSourceUrl( dataSource );
			console.log('Test URL : ' + url)
			//Run the query and test the time
			request(
				url,
				domain.bind(function(){
					data.sampleEnd  = new Date();
					next();
				}
			))
			data.sampleStart = new Date();
		}))
		
		/**
		* Work out the estimate based on the result of the sample
		*/
		.then(domain.bind(function(){
			
			var timePerSlice  = ((data.sampleEnd - data.sampleStart) - data.pingTime) / data.timeSliceSampleSize;
			var totalTime = data.timeSlicesInRange.length * timePerSlice;
			var endTime = totalTime + _this._startTime.getTime();
			
			_this._estimatedEndTime = new Date(endTime);
			
			_this._estimationStatus = {
				state: 'success',
				message: 'Finished estimated successfully',
				endTime : _this._estimatedEndTime,
				timePerSlice: timePerSlice /  1000
			}
			
		}))
}

//------------------------------------------
//Stats about the current download progress

/**
* Caluclates the perctage of complection of the download
*	- Tries to base percentage on sample taken earlier
*	- If estimate cant be made returns 0 or 100 based on completion
*
* @return {int} The percentage completed
*/
OPEC_Service.prototype.percentage = function(){
	// Return 100% if we have downloaded the file
	if( this._series_ready )
		return 100;
	
	// Try to calculate a percent based on time (if est is available)
	var est = this.estimatedEndTime();
	if( est )
		return ( ( new Date()  - this._startTime) / (est - this._startTime) ) * 100;
	
	// Else return 0%
	return 0;
}


/**
* Tries to return the estimated completion time
*	- Returns the actaul end time if the download finished
*	- Returns int if the completion time exists
*	- Returns null if time couldnt not be caculated
*
* @return {int} The percentage completed
*/
OPEC_Service.prototype.estimatedEndTime = function(){
		return this._estimatedEndTime;
}


OPEC_Service.prototype.estimationStatus = function(){
	if( this._estimationStatus.state == 'success' )
		this._estimationStatus.timeRemaining = ( this._estimatedEndTime - (new Date()) ) / 1000
		
	return this._estimationStatus;
	
}

OPEC_Service.prototype.startTime = function(){
	return this._startTime;
}

OPEC_Service.prototype.endTime = function(){
	return this._endTime;
}


OPEC_Service.prototype.hasFinished = function(){
	return this._series_ready;
}

//------------------------------------------


module.exports = OPEC_Service;
