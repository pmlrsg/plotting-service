/**
 * [hovmoller description]
 * @param  {[type]} d3        [description]
 * @param  {[type]} graphData {
 *     type // hovmollerLat|hovmollerLon,
 *     data: { data: Array } // hovmollerLat|hovmollerLon,
 *     options: {
 *        labelCount: int // how many labels to show ?
 *     }
 * }
 * @return {String}           Returns the XML for the SVG thats been rendered
 */

module.exports = hovmoller;
/**
 * [hovmoller description]
 * @param  {[type]} d3     d3 instance to build graph
 * @param  {String} type   hovmollerLat|hovmollerLon
 * @param  {[type]} data   [d
 * @param  {[type]} width  int
 * @param  {[type]} height [description]
 * @return {[type]}        Returns the XML for the SVG thats been rendered
 */
function hovmoller( type, data, width, height, callback ) {  
   var path = require('path')
   var childProcess = require('child_process')
   var phantomjs = require('phantomjs')
   var binPath = phantomjs.path

   var childArgs = [
     path.join(__dirname, '/../app/phantomjs-scripts/hovmollerSvg.js')
   ];

   var data = {
      'width'  : width,
      'height' : height,
      'type'   : type,
      'data'   : data,
   };
   var dataStr = JSON.stringify( data );


   var cp = childProcess.spawn( binPath, childArgs );
   
   // Send the settings
   cp.stdin.write( dataStr );
   cp.stdin.end();

   // Receive store the SVG back
   var stdoutData = "";
   cp.stdout.on( 'data', function( sentData ){
      stdoutData += sentData
   });

   // Receive store the SVG back
   var stderrData = "";
   cp.stderr.on( 'data', function( sentData ){
      stderrData += sentData
   });

   // Handle completion
   cp.stdout.on('close', function() {
      
      if( stderrData )
         callback( new Error(stderrData) );
      else
         callback( null, stdoutData);
   });
}


