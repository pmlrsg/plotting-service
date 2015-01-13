module.exports = routes;


// Handles the clients requiest to build the graph
var GraphJob = require( root + '/src/GraphJob');


var controllers = require( root + "/app/controllers" );

var url = require('url');
var Domain = require('domain');
var extend = require('node.extend');

/**
 * Sets up all the routes for express
 * @param  ExpressServer app The server instances to add the routes to
 */
function routes( app ){

   // URL parameters
   app.param('id', /^\d+$/); //job_id
   app.param('sourceHandlerId', /^\d+$/); //job_id
   app.param('returnType', /^(data|interactive|png|svg)$/); //Export types for graphs


   // Graphs
   app.post('/plot', controllers.graph.create);
   app.get('/plot/:id/status', controllers.graph.status);
   app.post('/plot/:id/download', controllers.graph.download);
   app.get('/plot/:id/:returnType', controllers.graph.show);

   // Legacy support, to be removed
   app.get('/job/:id/status', controllers.graph.status);
   app.get('/job/:id/:returnType', controllers.graph.show);


   // SVG Converts
   app.post('/svg-to/:format', controllers.svgConverter.convertTo);

   //Testing route
   app.get('/', function(req, res) {
      res.render('test-suite');
   });

}