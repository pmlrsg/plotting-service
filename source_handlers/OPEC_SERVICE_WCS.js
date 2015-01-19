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
	
	// Store lots of stuff locally...
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
	// Track what our progress is
	this._estimationStatus = {
		state: 'not started',
		message: 'Not started'
	};
	
	//Used for progress tracking
	this._startTime = new Date();
	this._series_ready = false;
	
	// Domain to catch errors if code
	// breaks somewhere
	var domain = Domain.active;
	
	// Function to start a counter for
	// where the graph should start estimating 
	// the completion time
	this.calculateEstimatedEndTimeAfterWait();
	
	// Get the URL of the datasource
	var url = this.buildSourceUrl( this._dataSource );
	logger.log( 'info', 'Getting URL ' + url, { job_id: domain.job.id() } );
	
	// Download and cache the download
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
	
	
	
	// Back data series-ready events if the above 
	// because all this code could finish before the reset
	// of the system can put a listener on this object
	this.on('newListener', function( event, func ){
		if( event == 'series-ready' && _this._series_ready )
			func();
	})
}

// This object extends the EventEmitter
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

// Symlink it to the over hovmoller
// Its the same damn code
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
	var variableKeys = [ 'min', 'max', 'median', 'mean' ];
	for( var variableKeyId = 0; variableKeyId < variableKeys.length; variableKeyId++ ){
		
		var variable = variableKeys[variableKeyId];
		
		//Make a new series
		var newSeries = {
			label : this._series.label + ' ' + variable, //graph name
			key: uid(),
			type : 'line', //graph type (line|bar|etc...)
			yAxis : this._series.yAxis, //graph axis
			disabled : defaltVariables.indexOf( variable) == -1,
			values: [], // place to store the points
			error: variable == 'mean'
		};

		newSeries.groupKey = groupKey,
		newSeries.groupLabel = variable
		
		//Loop over the downloaded points extracting the Y value needed
		for( var i in this._data ){
			var point = {
				x : i, // x axis,
				y : this._data[ i ][ variable ] // y axis
			};

			// Add error range to the mean
			if( variable == "mean" )
				point.error = this._data[i][ 'std' ];
			
			
			newSeries.values.push( point );
		}
		
		// Store the set of values by the data value
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

/**
 * Returns all of the groups to disaply
 * Some series are grouped together such as the
 * min, max and mean for a data set, these are separate
 * series but we can group them together for UI niceness later
 * @return Array [description]
 */
OPEC_Service.prototype.groups = function(){
	return this._formatedGroups;
}


OPEC_Service.prototype.sourceName = function(){
	return this._dataSource.coverage;
}

/**
 * Converts the data this source handler downloaded and
 * adds it to a archive for user downloading. This is it specifically
 * for the timeseries data downloaded from the portal.
 * 
 * @param  Object     archiver   The archive object to add the generated 
 *                               CSV's into. For the docs see:
 *                               https://www.npmjs.com/package/archiver
 * @param  String     folderName What folder in the archive should we
 *                               save these into
 * @param  Function   callback   Callback for after the CSV's are added
 */
OPEC_Service.prototype.resourceCsvTimeseries = function( archiver, folderName, callback){

	// CSV headers
	var titles = {
		datetime: "Date",
		min: "Min",
		max: "Max",
		mean: "Mean",
		median: "Median",
		std: "Standard Deviation",
	};

	// Convert the the JSON downloaded from data 
	// attached to a key of the data to and array
	// of data with a datetime attribute 
	var rows = [];
	for( var i in this._data ){
		var row = this._data[i];
		row.datetime = i;
		rows.push( row );
	}

	// Order the data by date
	rows.sort(function( a, b ){
		return new Date( a.datetime ) - new Date( b.datetime ); 
	});

	// Generate our CSV string
	var csvStr = csv( [titles].concat( rows ), {
		headers: false
	});

	// Add the generated CSV to the archive 
	archiver.append( csvStr, { name: folderName + 'data.csv' } );

	// Finished!
	callback();
}


/**
 * Converts the data this source handler downloaded and
 * adds it to a archive for user downloading. This is it specifically
 * for the hovmoller data downloaded from the portal.
 * 
 * @param  Object     archiver   The archive object to add the generated 
 *                               CSV's into. For the docs see:
 *                               https://www.npmjs.com/package/archiver
 * @param  String     folderName What folder in the archive should we
 *                               save these into
 * @param  Function   callback   Callback for after the CSV's are added
 */
OPEC_Service.prototype.resourceCsvHovmoller = function( archiver, folderName, callback){

	// CSV headers
	var titles = {
		0: "Date",
		1: this._type == 'hovermollerLat' ? 'Latitude':'Longitude',
		2: 'Value'
	};
	// The data from the server already matches
	// what the to-csv library needed
	var rows = this._data;

	// Make sure the data is ordered
	rows.sort(function( a, b ){
		return new Date( a[0] ) - new Date( b[0] ); 
	});

	// Get the CSV as string
	var csvStr = csv( [titles].concat( rows ), {
		headers: false
	});

	// Add the generated CSV to the archive
	archiver.append( csvStr, { name: folderName + 'data.csv' } );

	// Finished!
	callback();
}

/**
 * The reset of the system calls this function expecting it to 
 * fill the archive with a CSV. But depending on the graph type
 * the portal returns different JSON. This function calls the 
 * correct CSV converter for the datatype
 * 
 * @param  Object     archiver   The archive object to add the generated 
 *                               CSV's into. For the docs see:
 *                               https://www.npmjs.com/package/archiver
 * @param  String     folderName What folder in the archive should we
 *                               save these into
 * @param  Function   callback   Callback for after the CSV's are added
 */
OPEC_Service.prototype.resourceCsv = function( archiver, folderName, callback){
	if( this._type == 'timeseries' )
		return this.resourceCsvTimeseries( archiver, folderName, callback );
	if( this._type == 'hovmollerLat' || this._type == 'hovmollerLon' )
		return this.resourceCsvHovmoller( archiver, folderName, callback );

	return callback();
}

/**
 * Adds the meta data for this data source to the archive for download
 * When the plot request is submitted an array of meta data URL's can
 * be passed in. This downloads those URL's and concatenates them.
 * 
 * @param  Object     archiver   The archive object to add the generated 
 *                               CSV's into. For the docs see:
 *                               https://www.npmjs.com/package/archiver
 * @param  String     folderName What folder in the archive should we
 *                               save these into
 * @param  Function   callback   Callback for after the HTML has been added
 */
OPEC_Service.prototype.resourceMetaData = function( archiver, folderName, callback){
	var metaData = this._series.meta;
	if( !( this._series.markdown instanceof Array ) || this._series.markdown.length == 0 )
		finish();

	// Create a Lateral so we can download
	// multiple meta data sources at once
	var lateral = Lateral.create(function( complete, item, i ){
		request({
			url: item,
		}, function( err, response, body ){
			// If there was no error then add
			// it to the metaData collection
			if( ! err  && response.statusCode == 200){
				metaData += "<br><br>";
				metaData += body;
			}
			complete();
		});
	}, 5);
	// Add the URL's provided
	lateral.add( this._series.markdown );

	lateral.then(finish);
	
	// When its all downloaded add the html 
	// file to the to the archive and return	
	function finish(){
		archiver.append( metaData, { name: folderName + 'meta-data.html' } );
		callback();
	}
}


/**
 * Adds the logo of the data provider to the archive for download.
 * When the plot request is submitted a logo can be attached. This 
 * downloads that logo and adds it.
 * 
 * @param  Object     archiver   The archive object to add the generated 
 *                               CSV's into. For the docs see:
 *                               https://www.npmjs.com/package/archiver
 * @param  String     folderName What folder in the archive should we
 *                               save these into
 * @param  Function   callback   Callback for after the HTML has been added
 */
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
 * This functions adds the resources asked for in {rsources}
 * and attempts to add them to the archive, mostly it just
 * calls other functions in this object.
 * 
 * 
 * @param  String     resources  Array of resource names to attempt
 *                               attempt to download
 * @param  Object     archiver   The archive object to add the generated 
 *                               CSV's into. For the docs see:
 *                               https://www.npmjs.com/package/archiver
 * @param  Function   callback   Callback for after the resouces have been
 *                               added to the archive
 */
OPEC_Service.prototype.addResourcesToArchive = function( resources, archive, callback){
	// If resources isnt an array exit now
	if( ! ( resources instanceof Array ) )
		return callback();

	var changeCase = require('change-case');
	var _this = this;
	var total = 0;
	var count = 0;
	var stillAdding = true;
	var folderName = this._label + '/';

	// For each resource call the private
	// method to add the data to the zip
	resources.forEach(function( resource ){
		// We do things camel case here
		var functionName = changeCase.camel( 'resource-' + resource  )

		// Is there a resource handler for that resource
		if( _this[functionName] instanceof Function ){
			// Keep a track of how many resources we are waiting for
			total++;
			// If yes then call it!
			_this[functionName]( archive, folderName, resourceCollected );
		}
	});

	// For each resource check to see if we are still waiting
	// if not then run the callback
	stillAdding = false;
	function resourceCollected(){
		count++;
		if( count == total && stillAdding == false )
			callback( archive );
	}

	// resourceCollected() may not trigger the callback
	// if each resources was downloaded instantly 
	if( total == 0 || ( count == total && stillAdding == false ) )
		callback( archive );

}



////////////////////////////// ALL THIS BELLOW NEEDS REDOING
/// So its really ugly and could do with being made nicer
/// Please anyone, go for it
/// 


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
	// Dont rerun this function
	if( this._isCalculatingEstimatedEndTime )
		return;
	
	this._isCalculatingEstimatedEndTime = true;
	
	// Set the status to calculating
	this._estimationStatus = {
		state: 'calculating',
		message: 'Calculating',
	}
	
	// We need the metaCacheUrl so we can
	// work out how what a small time slice is
	if( typeof this._metaCacheUrl != 'string' )
		return;
	
	// Create a new domain so if this errors we dont
	// kill the node process
	var job = Domain.active.job;
	var domain = Domain.create();
	domain.job = job;
	
	// If we error log the eror and inform
	// the user we did
	domain.on('error', function( err ){
		_this._estimationStatus = {
			state: 'error',
			message: err.message
		}

		logger.log( 'error', 'Error when calculating estimate' , { job_id : domain.job.id(), error_stack: err.message, error_stack: err.stack  } );
	})
	
	// Use a sequence for niceness
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
						// Filter out the Dates out of the needed range
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
