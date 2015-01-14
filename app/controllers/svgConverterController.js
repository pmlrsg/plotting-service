/**
 * Handles simple SVG conversion
 * Can convert SVG to PNG or SVG to SVG (useful if you need to force download)
 */

var tmp = require('tmp');
var svg2png = require('svg2png');
var fs = require('fs');
var Sequence = exports.Sequence || require('sequence').Sequence;

/**
 * Convert to is the handler that does the conversion and return
 * See routes.js for the route
 * Will always force a download on the browsers side
 *
 * POST:
 * @param String svg      The svg string to use to convert
 * @param String format   The format to convert the SVG into
 * 
 */
exports.convertTo = function( req, res, next ){
   // Get the paramaters
   var format = req.param('format');
   var svgXML = req.param('svg');

   // For the output format
   switch( format ){
      case "svg":
         // SVGs can be thrown back just with some extra headers
         res.setHeader('Content-Disposition', 'attachment; filename=image.' + format );
         res.setHeader('Content-Type', 'image/svg+xml;charset=utf-8' );
         res.end(svgXML);
         break;
      case "png":
         // PNGS need more work
         
         //Set the headers for the attachment return
         res.setHeader('Content-Disposition', 'attachment; filename=image.' + format );
         res.setHeader('Accept-Ranges', 'bytes' );
         res.setHeader('Content-Type', 'image/png' );

         // Use a Sequence to keep the code clean
         var sequence = Sequence.create();
         var data = {};
         
         sequence
         // Create a temporary file to store the SVG in
         .then(function(sNext){
            tmp.file({ postfix: '.svg' }, function _tempFileCreated(err, path, fd) {
               if (err) return next(err);
               data.svgPath = path;
               data.svgFd = fd;
               fs.writeFile(path, svgXML);
               sNext();
            });
         })
         // Create a second temporary file to store the PNG in
         .then(function(sNext){
            tmp.file({ postfix: '.png' }, function _tempFileCreated(err, path, fd) {
               if (err) return next(err);
               data.pngPath = path;
               data.pngFd= fd;
               sNext();
            });
         })
         // Convert the file, send it and clean up
         .then(function(sNext){
            // Convert the file
            svg2png(data.svgPath, data.pngPath, function( err ){
               if (err) return next(err);

               // Send the file back to the user
               res.sendfile( data.pngPath );
               res.on( 'finish', cleanUp );
               res.on( 'close', cleanUp );

               //Remove the files after the file is send
               function cleanUp(){
                  var callback = function(){};
                  fs.unlink( data.svgPath, callback );
                  fs.unlink( data.pngPath, callback );

                  fs.close( data.pngFd, callback );
                  fs.close( data.svgFd, callback );
               }
               
            });
         })
         
         break;
   };

}