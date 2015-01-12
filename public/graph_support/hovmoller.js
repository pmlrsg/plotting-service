
var currentLoad = null;
var reloadAgain = false;
var imageGenerationTime = -1; // Average time for an image load

// Redownloads the hovmoller for the new screen size
function reloadImage(){
   

   // Request params, pass the screen size
   var attrs = {
      width: $('#main_img').width(),
      height: $('#main_img').height(),
   };

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
   }).attr( 'src', root + '/plot/' + plotId + '/png?' + $.param( attrs ) );

};

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

// init script
$(function(){
   var reloadTimeout = null; // Used to delay the creation of images

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
         reloadImage();
      }, 500);

   });
   
   // Loading the tarting image
   $(window).resize();
});


