var EventEmitter = require('events').EventEmitter;
var util = require('util');
var querystring = require('querystring');
var Domain = require('domain');
var request = require('request');
var memoizee = require( 'memoizee' );
var Sequence = exports.Sequence || require('sequence').Sequence;
var cachedRequest = memoizee(request,  { async: true });
var os = require('os');
var dns = require('dns');
var url = require('url');
var clone = require('clone');




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
		   
		   ////////////////////////////////////////////////////////////////////REMEMBER YOU PUT THIS HERE. REMVOE IT. IT DISABLES REQUESTS.
		   //return;
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
* Makes the series' in the timeline formmat
* Uses the downloaded data.
* 
* Takes the download data and loops over the date points pulling out the need values
* From this it builds new series that can be used in the actaul graph.
*/
OPEC_Service.prototype.seriesFormatters['timeseries'] = Timeseries = function(){
	this._formatedSeries = [];
	this._formatedGroups = [];
	groupKey = uuid();

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
			key : this._series.label + ' ' + variable, //graph name
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
	
	queryData.time = dataSource.t_bounds.map(function( dateString ){
		var date = new Date( dateString );
		//date = date.getFullYear() + "-" + date.getMonht() + "-" + date.getDate();
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


OPEC_Service.prototype.isOnSameSubnet = function( ip ){
	var ifaces=os.networkInterfaces();
	var addresses = [];
	for (var dev in ifaces) {
		var alias=0;
		ifaces[dev].forEach(function(details){
			if( details.family=='IPv4' && details.internal == false ) {
				addresses.push( details.address )
			}
		});
	}
	
	var match = addresses.some(function( computerIp ){
		return ( computerIp.substr(0, computerIp.lastIndexOf(-1)) == ip.substr(0, ip.lastIndexOf(-1))  );
	});
	
	return match;
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
	var _this = this;
	
	
	sequence
		
		/**
		* Work out if the netCDF is local to us (PML) or at an external source
		* Depending on its location depends on how many time slices we should use to sample
		.then(domain.bind(function(next){
			
			var parsed = url.parse(_this.threddsUrl);
			var domain = parsed.host;
			
			dns.resolve4( domain, domain.bind(function( err, ips ){
				if( err )
					throw new Error('The ip of the data source could not be found.');
				
				var hasLocalIp = ips.some(function( ip ){
					return this.isOnSameSubnet( ip );
				});
				
				if( hasLocalIp )
					data.timeSliceSampleSize = 20;
				else
					data.timeSliceSampleSize = 2;
				
				this._estimationStatus.timeSliceSampleSize = data.timeSliceSampleSize;
				
				next();
			}))
			
		}))
		*/
		
		.then(domain.bind(function(next){
			data.pingTime = 50;
			next();
			/*
			var parsed = url.parse(_this.threddsUrl);
			var domain = parsed.host;
			var pingStart = null;
			
			session.pingHost (domain, function (error, target) {
				pingStop = new Date();
				
			    if (error)
			        data.pingTime = 0;
			    else
			        data.pingTime = pingStop - pingStart;
			        
			    next();
			})
			pingStart = new Date();
			*/
		}))
		
	
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
				message: 'Finished estimated succesfully',
				endTime : _this._estimatedEndTime,
				timePerSlice: timePerSlice /  1000
			}
			
		}))
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
	
	// Try to calcualte a percent based on time (if est is avaliable)
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
