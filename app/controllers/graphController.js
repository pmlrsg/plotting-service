var url = require( 'url' );
var GraphJob = require( root + '/src/GraphJob' );
var domain = require('domain');


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
               graphId: job.id()
            } );
            break;
         case "data":
            res.json( graph.json() );
            break;

      }
      //job.serveAnswer( returnType, req , res );
   });

   
};