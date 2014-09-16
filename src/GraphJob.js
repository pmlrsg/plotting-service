var Job = require( './Job' );
var util = require( 'util' );
var Graph = require('./Graph');
var phantom = require('phantom');
var fs = require( 'fs' );
var Sequence = exports.Sequence || require('sequence').Sequence;
var Domain = require('domain');
var extend = require('node.extend');
 
var GraphJob = function(){
	this.constructor.super_.call( this, arguments );
};

util.inherits(GraphJob, Job);

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


GraphJob.prototype.ttl = function(){
	return config.job_life_span * 1000;
}


/**
* Takes in a request and finds the correct handler to server the request.
* Also adds in the download flag and throws errors if the job isnt ready
*
* @param {String} format The format to return (png|svg)
* @param {Request} req Node request object (used for pull url vars if needed)
* @param {Response} res Node response. Somewhere for it to send the response back to
*/
GraphJob.prototype.serveAnswer = function( format, req, res ){
	
	// Use a domain to handle errors nicely
	var domain = Domain.active;
	var _this = this;
	
	// Set download header if download flag is set
	if( req.query.download == "true" ){
		logger.log('info', 'User requests to download graph', { job_id : _this.id() });
		var fileName = _this._graph.title().replace( /[^a-zA-Z0-9\-_]/g, '-').replace( /\-+/g, "-" )
		req.setHeader('Content-disposition', 'attachment; filename=' + fileName + '.' + req.param( 'returnType' ).input );
	}
	
	
	// 404 if the job is still running
	if( _this._status.completed === false && _this._status.state != 'testing' )
		res.send( 404, 'Job still processing' );
	
	// Has the job completed with success
	if( _this._status.state == 'success' || _this._status.state == 'testing' ){
		
		switch( format ){
			case "png":
				_this.servePng( format, req, res );
				break;
			case "svg":
				_this.serveSvg( format, req, res );
				break;
			case "interactive":
				_this.serveInteractive( format, req, res );
				break;
			case "noninteractive":
				_this.serveNoninteractive( format, req, res );
				break;
			default:
				res.send( "500", 'Unknown output format' );
				break;
		}
	}else{
		res.send( "500", 'Graph building has errored.' );
	}
	
};

//-------------------------------------
// Single request handles

GraphJob.prototype.serveSvg = function( format, req, res ){

	var dimensions = this.getWidthAndHeight( req );
	
	this._graph.svg(function( svgXML ){
		res.setHeader('Content-Type', 'image/svg+xml' );
		res.end(svgXML);
	}, dimensions.width, dimensions.height);
};

GraphJob.prototype.serveInteractive = function( format, req, res ){
	this._graph.interactiveHtml(function( html ){
		res.setHeader('Content-Type', 'text/html' );
		res.end(html);
	});
};


GraphJob.prototype.serveNoninteractive = function( format, req, res ){
	this._graph.noninteractiveHtml(function( html ){
		res.setHeader('Content-Type', 'text/html' );
		res.end(html);
	});
};

GraphJob.prototype.servePng = function( format, req, res ){
	
	var dimensions = this.getWidthAndHeight( req );
			
	//Get the path for the PNG of required size
	this._graph.png( function( imagePath ){
		res.setHeader('Accept-Ranges', 'bytes' );
		res.setHeader('Content-Type', 'image/png' );
		
		//Stream the result back
		res.sendfile( imagePath );
	}, dimensions.width, dimensions.height);
};


//-------------------------------------


/**
* @return {Object} A copy of the jobs status
*/
GraphJob.prototype.status = function(value) {
	var progress = this._graph.progress();
	return extend( progress , this._status);
};


GraphJob.prototype.getWidthAndHeight = function( req ){
	function isInt( num ){ return Number( num ) % 1 === 0; };
	
	// Work out the right size
	
	var width = req.query.width || "auto";
	var height = req.query.height || "auto";
	
	if( isInt( width ) && isInt( height ) ){
		
	}else if( width == "auto" && isInt( height ) ){
		width = _this._graph.width() / this._graph.height() * height;
		
	}else if(  height == "auto" && isInt( width ) ){
		height =  this._graph.height() / this._graph.width() * width;
		
	}else{
		//The user didnt give width/height. Use graph defaults.
		width = this._graph.width();
		height = this._graph.height();
	}
	
	return {
		width: width,
		height: height
	};
}

//---------------------------------
// Getters and setters
GraphJob.prototype.graphRequest = function( request ){
	this._request = request;
	return this;
};

module.exports = GraphJob;