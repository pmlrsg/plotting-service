/**
 * Helper function to be called in node that
 * interfaces with the hovmollerSvg.js phantomjs script
 */

var extend = require( 'node.extend' );

module.exports = {};

module.exports.png = function( type, data, options, callback ){
   hovmoller( type, data, 'png', options, callback );
}

module.exports.svg = function( type, data, options, callback ){
   hovmoller( type, data, 'svg', options, callback );
}

/**
 * [hovmoller description]
 * @param  String   type         Created a `hovmollerLat` or `hovmollerLon`
 * @param  Object   data         The data to build the graph with
 * @param  String   returnType   Whether to return a `svg` or `png`
 * @param  Object   options      An object of options to build the graph
 * Example options: {
 *    title : String
 *    width : int
 *    height : int
 *    flip-x-y-axis : 0|1
 *    reverse-scalebar : 0|1
 *    reverse-y-axis : 0|1
 * }
 * @param  Function callback     Returns the SVG or the PNG depending on `returnType`
 */
function hovmoller( type, data, returnType, options, callback ) {  
   var path = require('path')
   var childProcess = require('child_process')
   var phantomjs = require('phantomjs')
   var binPath = phantomjs.path

   // Add the path to the phantom script
   var childArgs = [
     path.join(__dirname, '/../app/phantomjs-scripts/hovmollerSvg.js')
   ];

   // Get the options ready to send to the phantom script
   var data = {
      'type'   : type,
      'returnType' : returnType,
      'data'   : data,
   };
   extend( data, options );

   // Stringify the data
   var dataStr = JSON.stringify( data );

   // Start the script
   var cp = childProcess.spawn( binPath, childArgs );
   
   // Send the settings to the script
   cp.stdin.write( dataStr );
   cp.stdin.end();

   // Receieve and store the output
   var stdoutData = "";
   cp.stdout.on( 'data', function( sentData ){
      stdoutData +=  sentData;
   });

   // Receive and store the errors if any happen
   var stderrData = "";
   cp.stderr.on( 'data', function( sentData ){
      stderrData += sentData
   }); 


   // Handle completion
   cp.stdout.on('close', function() {
      if( stderrData )
         return callback( new Error(stderrData) );
      

      if( returnType == 'svg' )
         // SVG's are returned as XML so stream that
         callback( null, stdoutData);
      else
         // PNG's are returned as Base64 so decode that into a buffer
         callback( null, new Buffer( stdoutData , 'base64') );
   });
}


