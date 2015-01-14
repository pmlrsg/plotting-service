/**
 * Script used to build the hovmollers
 */
var currentLoad = null;
var imageGenerationTime = -1; // Average time for an image load

// Resets/runs the percentage counter in the loading icon
var loadingCounterTimeout;
function resetLoadingCounter(){

   // Dont run the counter if we dont have generation time
   if( imageGenerationTime == -1 )
      return;

   // Stop any current running counter
   clearInterval( loadingCounterTimeout );
   var startTime = new Date();

   loadingCounterTimeout = setInterval(function(){
      // Work out percentage of progress based on start time
      var percent =  Math.round((((new Date) - startTime) / imageGenerationTime) * 100);

      // If we hit 100% we dont need to keep doing this interval
      if( percent > 100 ){
         clearInterval( loadingCounterTimeout );
         percent = 100;
      }

      $('.loading span').text( 'Loading: ' + percent + '%' );
   }, 200);
   
}


var hovmollerController = $.extend( graphController, {

  /**
   * This produces an SVG of the current graph being shown.
   * It will hide the context chart, show the legend, then copy the SVG.
   * It will also embed the NVD3 style into the SVG.
   * 
   * @param  {Function} callback Once the SVG has been build its
   *                             passed into the callback
   */
   svg: function( callback ){

      // Get the style sheet and build a SVG
      var _this = this;

      // Show loading wheel
      $('.loading').show();
      resetLoadingCounter();

      // Ajax get the SVG
      $.ajax({
         url:  this.imageUrl('svg'),
         dataType: 'text',
         success: function( svg ){
            callback( svg );
         },
         complete: function(){
            $('.loading').hide();
         }
      });
  },

   
  /**
   * This function triggers the download.
   * It will read the checkboxs expected to have been 
   * produces via the downloadInit function from general.js
   */
   download: function(){
      var _this = this;

      // Fetch the SVG first
      this.svg(startDownload);

      // Create a form and submit all the data
      // The form is needed because a download can be trigger via 
      // a form submit but not an AJAX call
      function startDownload( svg ){
         $('<form>')
           .attr('method', 'post')
           .attr('action', root + "/plot/" + plotId + '/download' )
           .append( $('<input>').attr('type','hidden').attr('name','svg').val( svg ) )
           .append( $('#download-content input[type=checkbox]:checked').clone() )
           .hide()
           .appendTo('body')
           .submit();
      };
  },

   /**
    * Reloads the hovmoller image
    */
   reloadImage: function (){
   
      // Show the loading icon
      $('.loading').show();
      resetLoadingCounter();

      //Store the start time (for generation time benchmark)
      var startTime = new Date();
      currentLoad = $('<img>').load(function(){
         if( currentLoad[0] != this )
            return;

         //Store the stop time (for generation time benchmark)
         var endTime = new Date();

         // If we dont already have a estimated generation time,
         // Store this one
         if( imageGenerationTime == -1 )
            imageGenerationTime = endTime - startTime;

         // Hide the loading icon
         $('.loading').hide();

         // Replace the exiting image with the new one
         $('#main_img')
            .html("")
            .append(this);
      }).attr( 'src', this.imageUrl('png') );

   },
   /**
    * Get the image generation URL
    * @param   String  type  What image is requested, current `svg` or `png`
    * @return  String        The full URL to the image
    */
   imageUrl: function( type ){
      // Request params, pass the screen size
      var attrs = {
         width: $('#main_img').width(),
         height: $('#main_img').height(),
      };
      $.extend(attrs, Settings.get(), true);

      return root + '/plot/' + plotId + '/' + type + '?' + $.param( attrs );
   },
   /**
    * Init script for the hovmoller.
    * Does:
    *    Stores data in local varibles
    *    Sets up the sidebar buttons, meta text
    *    Attaches the resize handler to auto reload the image
    *    Loads the first image
    *    
    * @param  Object data Data from the graphs /data request
    */
   initChart: function( data ){
      // Store data locally
      this.groups = data.groups;
      this.request = data.request;
      this.series = data.series;

      // Get the template for the sidebar meta
      var html = Templates.get('series')( this.request.plot.data.series[0] );
      $('#sidebar-info').html( html );

      // Add data source logos
      if( this.request.style && this.request.style.logos )
         this.addLogos( this.request.style.logos );

      // Used to delay the creation of images
      var reloadTimeout = null;

      // Restore settings
      $('#flip-x-y-axis').prop( 'checked', Settings.get( 'flip-x-y-axis' ) == '1' );
      $('#reverse-y-axis').prop( 'checked', Settings.get( 'reverse-y-axis' ) == '1' );
      $('#reverse-scalebar').prop( 'checked', Settings.get( 'reverse-scalebar' ) == '1' );

      // Attach listeners to the 3 settings buttons so if one
      // is toggled we update the settings and reload the graph
      $('#flip-x-y-axis, #reverse-y-axis, #reverse-scalebar').change(function(){
         Settings.set( $(this).attr('id'), $(this).prop('checked') ? 1:0 );
         hovmollerController.reloadImage();
      });

      // When the page is resized reload the image
      // so the image always fills 100% of the space
      $(window).resize(function(){
         // Show the loading text
         $('.loading').show();
         $('.loading span').text( 'Generating...' );

         // Resize the main image body
         $('#main_img').css({
            width: $(window).width() - $('#sidebar').width(),
            height: $(window).height(),
         });
         
         // Only generate a new image after a 500mil
         // wait time because LOTS of resize events are 
         // sent when the user resizes the browser
         clearTimeout( reloadTimeout );
         reloadTimeout = setTimeout(function(){
            hovmollerController.reloadImage();
         }, 500);

      });
      
      // Loading the tarting image
      $(window).resize();
   },

  /**
   * Starts of the process of building graph.
   * Downloads the graph data and then calls initChart
   */
  init: function(){
   // Init the settings module
   Settings.load();

   // Download the chart data
   var _this = this;
   $.ajax({
      dataType: "json",
      url: root + "/job/" + plotId + "/data",
      success: function( data ){
        try{
          _this.initChart( data );
        }catch(e){
          _this.error( "Could not download the data.", e );
        };
      },
      error: function( err ){
        _this.error( "Could not download the data.", err );
      }
    });
  },

});

// Once the page DOM is loaded
// start running the build graph scripts
$(function(){
  Templates.init();
  hovmollerController.init();
  $('.tooltip').tooltipster()
});