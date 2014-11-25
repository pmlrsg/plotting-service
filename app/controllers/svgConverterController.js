
var tmp = require('tmp');
var svg2png = require('svg2png');
var fs = require('fs');
var Sequence = exports.Sequence || require('sequence').Sequence;

exports.convertTo = function( req, res, next ){

   var format = req.param('format');
   var svgXML = req.param('svg');
   switch( format ){
      case "svg":
         res.setHeader('Content-Disposition', 'attachment; filename=image.' + format );
         res.setHeader('Content-Type', 'image/svg+xml;charset=utf-8' );
         res.end(svgXML);
         break;
      case "png":
         res.setHeader('Content-Disposition', 'attachment; filename=image.' + format );
         res.setHeader('Accept-Ranges', 'bytes' );
         res.setHeader('Content-Type', 'image/png' );


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
         // Create a second temporary file to store the SVG in
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
            svg2png(data.svgPath, data.pngPath, function( err ){
               if (err) return next(err);

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