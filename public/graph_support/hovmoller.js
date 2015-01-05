
var currentLoad = null;
var reloadAgain = false;

function reloadImage(){
   if( currentLoad != null ){
      reloadAgain = true;
      return;
   }

   var attrs = {
      width: $(window).width(),
      height: $(window).height(),
   };


   $('.loading').show();

   currentLoad = $('<img>').load(function(){
      reloadAgain = false;
      currentLoad = null;
      $('.loading').hide();

      if( reloadAgain )
         reloadImage();
      else
         $('#main_img')
            .html("")
            .append(this);
   }).attr( 'src', root + '/plot/' + plotId + '/png?' + $.param( attrs ) );

};

$(function(){
   var reloadTimeout = null;
   $(window).resize(function(){
   
      $('.loading').show();

      $('#main_img').css({
         width: $(window).width() - 1,
         height: $(window).height() - 1,
      });
      
      clearTimeout( reloadTimeout );
      reloadTimeout = setTimeout(function(){
         reloadImage();
      }, 500);

   });
   
   reloadImage();
});