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
* Returns the current status of a job you requested
* 
* @return {JSON} States of the job you requested
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
* Correct headers are sent to maktch the content type
* 
* @return {Binary} Returns data that suits the Job type
*/
graphController.show = function( req, res, next ){

   var job = manager.getJob( req.param( 'id' ).input );
   if( !job )
      return res.send( 404, "Job not found" );
   var graph = job._graph;

   var returnType = req.param( 'returnType' ).input;
   logger.log('info', 'Serving graph in format ' + returnType , { job_id : job.id(), return_type : returnType });
   
   var d = domain.create();
   d.on('error', next);
   d.run(function(){
      switch( returnType ){
         case "interactive":
            // Render the correct graph type
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
      //job.serveAnswer( returnType, req , res );
   });

   
};


/**
* Returns the data of the job in the requested format.
* Correct headers are sent to maktch the content type
* 
* @return {Binary} Returns data that suits the Job type
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

   // Que up the different resources needed for ziping
   var lateral = Lateral.create(runResourceFunction, 5);
   lateral.push = function( item ){
      this.add( [item] );
   };
   function runResourceFunction( complete, item, i ){
      item( complete, item, i );
   }
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


