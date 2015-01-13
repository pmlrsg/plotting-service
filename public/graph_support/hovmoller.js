
var currentLoad = null;
var reloadAgain = false;
var imageGenerationTime = -1; // Average time for an image load

// Redownloads the hovmoller for the new screen size


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
      $('.loading').show();
      resetLoadingCounter();
      $.ajax({
         url:  this.imageUrl('svg'),
         dataType: 'text',
         success: function( svg ){
            callback( svg );
         },
         complete: function(){

            $('.loading').show();
         }
      });
  },

   
  /**
   * This function triggers the download of the current in a certain function.
   * 
   * @param  {String} format The format to download in, e.g PNG,SVG,CSV
   */
   download: function( format ){
      var _this = this;

    this.svg(startDownload);

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

         // Assuming when dont already have a generation time,
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

   imageUrl: function( type ){
      // Request params, pass the screen size
      var attrs = {
         width: $('#main_img').width(),
         height: $('#main_img').height(),
      };
      $.extend(attrs, Settings.get(), true);

      return root + '/plot/' + plotId + '/' + type + '?' + $.param( attrs );
   },

   initChart: function( data ){
      this.groups = data.groups;
      this.request = data.request;
      this.series = data.series;

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

      $('#flip-x-y-axis, #reverse-y-axis, #reverse-scalebar').change(function(){
         Settings.set( $(this).attr('id'), $(this).prop('checked') ? 1:0 );
         hovmollerController.reloadImage();
      });

      // Resize the image on load
      $(window).resize(function(){
      
         $('.loading').show();
         $('.loading span').text( 'Generating...' );

         // Werid hack to keep the image in the center...
         // Only works because of the CSS also on "#main_img img"
         $('#main_img').css({
            width: $(window).width() - $('#sidebar').width(),
            height: $(window).height(),
         });
         
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
   * 
   */
  init: function(){

    Settings.load();

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



// Once everything has loaded build the graph
$(function(){
  Templates.init();
  hovmollerController.init();
  $('.tooltip').tooltipster()
});