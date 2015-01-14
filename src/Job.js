/**
 * Jobs are to be used with the Manager class
 * The idea of a Job is a class that can be extend
 * and then sent to the manager so that it can be
 * handled, deleted, clean up after it, etc..
 *
 * Due to the limited size of this project and
 * the fact that lots of code, mostly the processing
 * of the data will not be going in to this project
 * the Job and Manager stuff could be removed.
 * 
 */
var Domain = require('domain');
var util = require('util');
var fs = require('fs');
var extend = require('node.extend');
var EventEmitter = require('events').EventEmitter;

/**
 * Creates a job class
 */
function Job(){

	EventEmitter.call( this, arguments );
	
	this._id = Math.floor(Math.random() * 1000);

	this._status = {
		message: "Unknown",
		state: 'processing', // ( error | success | processing )
		completed: false
	};
	 
	this._events = {};
	this._filesUsed = [];
	this._data = null;
	
	// Domains we can alert the user if build the SVG data crashes
	this.domain = Domain.create();
	this.domain.job = this;
	var _this = this;
	
	// Monitor different status update events

	this.on('error' ,function( errorMessage ){
		_this._status.state = 'error'; // ( error | success | processing )
		_this._status.completed = true
		_this._status.message = errorMessage;
	});
	
	this.on('success' ,function(){
		_this._status.state = 'success'; // ( error | success | processing )
		_this._status.completed = true
		_this._status.message = 'Job finished';
	});
	
	this.on('progress' ,function( progress ){
		_this._status.message = progress;
	});
	
	this.on('testing' ,function( progress ){
		_this._status.state = 'testing'; // ( error | success | processing )
		_this._status.message = 'Validating graph';
	});
	
	//If the job errors then clean up
	this.domain.on('error', function( err ){
		
		var meta =  { job_id : _this.id(), error_message : err, error_stack : err.stack };
		extend( meta, err.meta || {} );
		logger.log('error', err.toString(), meta);
		
		_this.emit( 'error', err.toString() ); //report it for the user
		_this.domain.dispose(); // Destory the domain stop other processes
	});
}

util.inherits(Job, EventEmitter);

/**
* Destorys the current job:
* - Destorys the domain (stopping any pending tasks)
* - Deletes any tempory files
*/
Job.prototype.destory = function(){
	//Destory the processing domain if its still running
	this.domain.dispose();
	
	//Remove any files
	this._filesUsed.forEach( function( filePath ){
		fs.unlink( filePath , function(){
			logger.log( 'info', 'Cleaning up file: ' + filePath );
		});
	});
};

/**
* @return {int} The jobs ID
*/
Job.prototype.id = function(value) {
	if (!arguments.length) return this._id;
	this._id = value;
	return this;
};

/**
* @return {Object} A copy of the jobs status
*/
Job.prototype.status = function(value) {
	return extend({}, this._status);
};


/**
* Returns true or false pending on if the job has finished running.
* The job may have finished with an error or success
* @return {bool} Has the job finished
*/
Job.prototype.completed = function() {
	return this._status.completed;
};


/**
* Makes a tempory file path that is tracked and automtically removed at the end.
*  - Files are named {unix_timestamp}-{counter}
*  - The counter is reset each time the program runs
*
* @param {Function} callback A the callback to return the file path
*/
Job.prototype.tmpFile = (function(){
	var count = 0;
	return function( callback, ext ){
		var _this = this;
		var path;
		
		// Keep looping until we find a free path	
		do{
			path = config.cache + "temp-" + new Date().getTime() + "-" + ( count++ ) +  (ext ? ('.' + ext):'');
		}while( fs.existsSync( path ) );
		_this._filesUsed.push( path );
		callback( path );
	};
})();

/**
* Encapulates the process command with a domain
*/
Job.prototype.processInDomain = function(){
	var _this = this;
	process.nextTick(function(){
		_this.domain.run(function(){
			_this.process();
		});
	});
};

module.exports = Job;