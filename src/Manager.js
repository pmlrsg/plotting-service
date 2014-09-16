var Domain = require('domain');
var util = require('util');
var fs = require('fs');
var extend = require('node.extend');
var EventEmitter = require('events').EventEmitter;


/**
* The manager class is a place to store the active jobs.
*  Extra tasks it does is:
*    Remove the tasks after a time out
*    Runs the job
*/
function Manager(){
	this._jobs = {};
}

/**
* Takes a Job. Stores it and sets and auto delete time on it of _autoRemove
*
* @param {Job} job Expects a subclass of job
*/
Manager.prototype.addJob = function( job ){
	this._jobs[ job.id() ] = job;
	job.processInDomain();
	
	//Remove the job after a fixed number of time
	var _this = this;
	var timeoutId = setTimeout(function(){
		_this.removeJob( job.id() );
	}, job.ttl() );
	timeoutId.unref(); 
};


/**
* Sets the default amount of time a job should last until its auto removed.
*
* @param {int} time Number of seconds a job should last 
*/
Manager.prototype.autoRemove = function( time ){
	if (!arguments.length) return this._autoRemove;
	this._autoRemove = time  * 1000;
	return this;
};


/**
* Return the job with the given id.
*
* @param {int} jobId The job ID to use 
*/
Manager.prototype.getJob = function( jobId ){
	return this._jobs[ jobId ];
};

/**
* Remove a job from the store and tell it to destory its self
* 
* @param {int} jobId The job ID to use 
*/	
Manager.prototype.removeJob = function( jobId ){
	this._jobs[ jobId ].destory();
	delete this._jobs[ jobId ];
};

/**
* Removes all the jobs
*/	
Manager.prototype.removeAllJobs = function(  ){
	for( var i in this._jobs){
		if( !this._jobs.hasOwnProperty( i ) ) true;
		
		this.removeJob( i );
	}
};

module.exports = Manager;