var express = require( 'express' );

module.exports = function( app ){

   app.engine('.ejs', require('ejs').__express);
   app.set('views', __dirname + '/../views');
   app.set('view engine', 'ejs');
   app.set('trust proxy', ['loopback']);

   app.use(express.bodyParser({limit: '512mb'}));

   // All overriding over content-type so
   // IE8 can set content type to JSON
   // Stupid IE...
   app.use(function (req, res, next) {
      if( req.method != 'POST' )
         return next();
      if( req.param('content-type') != void(0) )
         req.headers['content-type'] = req.param('content-type');
      next();
   });

   app.use(function (req, res, next) {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
      next();
   });

   app.use(express.bodyParser());
   app.use(app.router);

   /**
   * Allows Express URL paramaters to accept regex
   */
   app.param(function(name, fn){
     if (fn instanceof RegExp) {
       return function(req, res, next, val){
         var captures = fn.exec(String(val));
         if (captures) {
           req.params[name] = captures;
           next();
         } else {
           next('route');
         }
       };
     }
   });

   app.use(express.static(root + '/public'));

   app.use( express.errorHandler() );
};
