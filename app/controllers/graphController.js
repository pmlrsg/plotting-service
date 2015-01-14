/**
 * This file/module controllers the the routes relating to the graph.
 * These are /plot/*
 */

var url = require( 'url' );
var GraphJob = require( root + '/src/GraphJob' );
var domain = require('domain');
var tmp = require('tmp');
var request = require('request');
var archiver = require('archiver');
var path = require('path');
var Lateral = require('lateral').Lateral;
var Increment = require("incr");



module.exports = graphController;

function graphController(){};

/**
 * Handlers the creation of new graphs.
 * Expects a graph request. See example folder for
 * graph request examples.
 * 
 * @return JSON        Returns JSON string with the id of the job
 */
graphController.create = function( req, res, next ){
   
   var request = req.param( 'request' );

   var job = new GraphJob().graphRequest( request );
   manager.addJob( job );
   
   // Return details about the job
   res.json({
      'job_id': job.id()
   });
};



/**
* Returns the current status of a job you requested.
* With throw 404 if the job id doesnt exist.
* Jobs can throw a 404 is the server restarted.
* 
* @return {JSON} Status of the job you requested
*/
graphController.status = function( req, res, next ){

   var job = manager.getJob( req.param( 'id' ).input );
   if( ! job ){
      return res.send(404, {
         'status' : 'error',
         'messsage': 'This job id has not been found on the server.'
      });
   }
   
   var status =  job.status();
   status.job_id = job.id();
   res.json( status );
};


/**
* Returns the data of the job in the requested format.
* Correct headers are sent to match the content type.
* Relevant types:
*    interactive : Used for the popup to load the graph, sidebar,etc
*    data :     Returns the JSON needed to display the graph. Used by
*               interactive but could be used by anything.
*    png :      A PNG of the graph, requirments differ depending on graph type
*    svg :      Same as above, paramaters need to complete the request
*               will depend on graph type
*    
* 
* @return {Binary} Returns data that suits the Job type
*/
graphController.show = function( req, res, next ){

   // Find the job of throw 404
   var job = manager.getJob( req.param( 'id' ).input );
   if( !job )
      return res.send( 404, "Job not found" );
   var graph = job._graph;

   // Get the rquest show format
   var returnType = req.param( 'returnType' ).input;
   logger.log('info', 'Serving graph in format ' + returnType , { job_id : job.id(), return_type : returnType });
   
   // Create a domain in case it errors
   var d = domain.create();
   d.on('error', next);
   d.run(function(){

      // Find the correct show format
      switch( returnType ){
         case "interactive":
            res.render( 'graphs/' + graph.type(),{
               plotId: job.id()
            });
            break;
         case "data":
            res.json( graph.json() );
            break;
         case "png":
            graph.png( req.query, function( err, pngBuffer ){
               if( err )
                  return next( err );
               
               res.setHeader('Content-Type', 'image/png' );
               res.send( pngBuffer );
            });
            break;
         case "svg":
            graph.svg( req.query, function( err, svgBuffer ){
               if( err )
                  return next( err );
               
               res.setHeader('Content-Type', 'image/svg+xml' );
               res.send( svgBuffer );
            });
            break;

      }
   });

   
};


/**
* Will return a zip of the request graph type.
* This expects an array of the download formats needed
* Also expects the SVG posted used to generate the PNG
* and to return in the zip
* 
* @return {Binary} The zip file
*/
graphController.download = function( req, res, expressNext ){

   // Pre the graph related resources needed
   var job = manager.getJob( req.param( 'id' ).input );
   if( !job )
      return res.send( 404, "Job not found" );
   var graph = job._graph;

   // Get formats the user wants to download
   var formats = req.param( 'formats' );
   if( ! ( formats instanceof Array ) )
      next( new Error( 'No valid resources where requested.' ) );

   // Get the built SVG, swap this out for server side recreation
   var svg = req.param( 'svg' );


   //Send the ZIP headers
   res.setHeader('Content-Disposition', 'attachment; filename=package.zip' );
   res.setHeader('Accept-Ranges', 'bytes' );
   res.setHeader('Content-Type', 'application/zip, application/octet-stream' );

   // Get a zip file ready
   var archive = archiver( 'zip' );
   archive.on( 'error', expressNext );
   archive.pipe( res );

   // Use lateral to run multiple things asynchronously 
   var lateral = Lateral.create(runResourceFunction, 5);

   // Helper to allow the running/adding of single
   // items at a time
   lateral.push = function( item ){
      this.add( [item] );
   };

   // Helper function for latteral that allows use 
   // to just que up functions for completion
   function runResourceFunction( complete, item, i ){
      item( complete, item, i );
   }

   // Place to store errors and return them
   // in the zip later if they occur
   var errorLog = [];

   // Add the PNG if asked for
   if( formats.indexOf( "png" ) > -1 ){
      
      // Wrap function runnable by lateral
      var addPng = function( complete, _, i ){

         // Paramaters for the request
         var pngParamaters = {
            method: 'POST',
            url: loopback + '/svg-to/png',
            form: { svg: svg },
            encoding: null // tells request to return a Buffer as body
         };

         // Callback to the add the png to the archive
         var pngCallback = function( err, httpResponse, body ){
            if( err ){
               errorLog.push( "PNG failed to be created - " + err );
            }else{
               archive.append( body , { name: 'image-png.png' })
            }
            complete();
         };

         request( pngParamaters, pngCallback );
      }
      // Add the function to the lateral que
      lateral.push( addPng );
   };

   // Add the SVG is asked for
   if( formats.indexOf( "svg" ) > -1 ){
      archive.append( svg , { name: 'image-svg.svg' })
   }

   // Pass everything else to the source handles
   graph.sourceHandlers().forEach( getSourceHandlerResources );
   function getSourceHandlerResources( sourceHandler ){
      lateral.push(function( complete, _, i ){
         // Request the source handler for the needed format
         sourceHandler.addResourcesToArchive( formats, archive, complete );
      });
   }

   /**
    * Once all the files are downloaded save the error log
    * to the zip and export the zip to the browser
    */
   lateral.then(finish);
   function finish(){
      if( errorLog.length > 0 )
         archive.append( errorLog.join("\n") , { name: 'errors.txt' })

      archive.finalize();
   }
   
};


