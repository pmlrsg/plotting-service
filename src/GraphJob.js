/**
 * This file creates and subclass of Job to 
 * be used with processing a graph.
 *
 * Really this and the job class could be dropped
 * and you could integrate it the function it a mix
 * of the graphController and static Graph methods.
 * But i had to time to do that
 * 
 */

var Job = require( './Job' );
var util = require( 'util' );
var Graph = require('./Graph');
var phantom = require('phantom');
var fs = require( 'fs' );
var Sequence = exports.Sequence || require('sequence').Sequence;
var Domain = require('domain');
var extend = require('node.extend');

// Joins the Job and the Graph classes
var GraphJob = function(){
	this.constructor.super_.call( this, arguments );
};


util.inherits(GraphJob, Job);

// Basically an init script to be called after
// the request has been set. It starts
// the downloading/generation of the graph.
GraphJob.prototype.process = function(){
	var _this = this;
	
	this._graph = new Graph( this._request );
	this._graph.job( this );
	this._graph.on('complete', function(){
		_this.emit( 'success' );
		
	}).on('testing', function(){
		_this.emit( 'testing' );
		
	}).on('progress', function( progress ){
		_this.emit( 'progress', progress );
		
	});
	
	this.emit('progress', "Downloading resources");
	
	this._graph.init();
	
};

// How long should a plot live until
// its automatically deleted
GraphJob.prototype.ttl = function(){
	return config.job_life_span * 1000;
}


//-------------------------------------


/**
* @return {Object} A copy of the jobs status
*/
GraphJob.prototype.status = function(value) {
	var progress = this._graph.progress();
	return extend( progress , this._status);
};


//---------------------------------
// Getters and setters
GraphJob.prototype.graphRequest = function( request ){

   logger.log('info', 'New Job', { job_id : this.id(), request : request });

	this._request = request;
	return this;
};

module.exports = GraphJob;