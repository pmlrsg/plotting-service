var url = require( 'url' );
var GraphJob = require( root + '/src/GraphJob' );
var domain = require('domain');
var tmp = require('tmp');
var request = require('request');
var archiver = require('archiver');
var path = require('path');
var Lateral = require('lateral').Lateral;



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
            res.render( 'graphs/' + graph.type(),{
               plotId: job.id()
            } );
            break;
         case "data":
            res.json( graph.json() );
            break;
         case "csv":
            var sourceHandlerId = req.param('sourceHandlerId');
            res.send( graph.csv( sourceHandlerId ) );
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

   var formats = req.param( 'formats' );
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
   var lateral = Lateral.create(downloadResource, 5);
   var requests = [];
   var errorLog = [];

   for( var i = 0; i < formats.length; i++ )
      lateral.add( makeResourceRequest( formats[i] ) );

   lateral.then(finish);

   /**
    * Returns and array of resource requests needed to
    * be to downloaded and zipped up
    */
   function makeResourceRequest( format ){
      var requests = [];

      switch( format ){
         case "png":
            requests.push({
               request: {
                  method: 'POST',
                  url: loopback + '/svg-to/png',
                  form: { svg: svg }
               },
               fileName : "image-png.png"
            });
            break;
         case "svg":
            requests.push({
               request: {
                  method: 'POST',
                  url: loopback + '/svg-to/svg',
                  form: { svg: svg }
               },
               fileName : "image-svg.svg"
            });
            break;
         case "csv":
            var handlers = graph.sourceHandlers();
            for( var i = 0; i < handlers.length; i++ )
               requests.push({
                  request: {
                     method: 'GET',
                     url: loopback + '/plot/' + job.id() + '/csv/' + i
                  },
                  fileName : handlers[i].sourceName() + ".csv"
               });
            break;
         case "logos":
            if( graph.request().style && Array.isArray( graph.request().style.logos ) ){
               var logos = graph.request().style.logos;
               for( var i = 0; i < logos.length; i++ ){
                  var logo = logos[i];
                  requests.push({
                     request: {
                        method: 'GET',
                        url: logo,
                     },
                     fileName : 'logos/' + path.basename(logo)
                  });
               }
            }
            break;
      };

      return requests;
   }


   /**
    * Download the resource and add it the the zip file
    */
   function downloadResource( complete, item, i ){
      item.request.encoding = null;
      request(
         item.request,
         function( err, httpResponse, body ){
            if( err ){
               errorLog.push( item.fileName + " failed to be created - " + err );
            }else{
               archive.append( body , { name: item.fileName })
            }
            complete();
         }
      )
   }
   /**
    * Once all the files are downloaded save the error log
    * to the zip and export the zip to the browser
    * @return {[type]} [description]
    */
   function finish(){
      if( errorLog.length > 0 )
         archive.append( errorLog.join("\n") , { name: 'errors.txt' })

      archive.finalize();
   }
   
};


