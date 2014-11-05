Templates = {
  templates: {},
  init: function( key ){
    $('[id*="-template"]').each(function(){
      var templateName = $(this).attr('id');
      templateName = templateName.substr( 0, templateName.indexOf('-template') );
      var templateHtml = $(this).html();

      Handlebars.registerPartial( templateName, templateHtml );
      Templates.templates[templateName] = Handlebars.compile( templateHtml );
    });

    Handlebars.registerHelper('or', function(options, arg1, arg2) {
      return arg1 || arg2 ;
    });
  },
  get: function( key ){
    if( key in this.templates ) return this.templates[key];
    throw new Error("Template '" + key + "'' does not exists");
  }
};
/**
* Sorts the logos disabled by height for style reasons
*  - Will not work in IE8
*/
function reorderLogos(){
  // Abort if getComputeStyle isnt allowed
  try{
     if( ! document.defaultView || ! document.defaultView.getComputedStyle )
        return;

     var logosElement = document.getElementById( 'logos' );
     var logosElementWidth = $(logosElement).width();

     var children = [];
     for ( var i in logosElement.children){
        if( logosElement.children[i] instanceof HTMLElement )
           children.push( logosElement.children[i] );
     }

     children.sort(function( imgElementA, imgElementB ){
        if( ( (logosElementWidth / 2) / imgElementA.naturalWidth ) * imgElementA.naturalHeight < 35 )
          return 1;

        var heightA = $( imgElementA )[0].naturalWidth;
        var heightB = $( imgElementB )[0].naturalWidth;
        return heightA > heightB ? 1: -1;
     }).forEach(function( imgElement ){
        logosElement.appendChild( imgElement );

        if( ( (logosElementWidth / 2) / imgElement.naturalWidth ) * imgElement.naturalHeight < 35 )
          var width = '100%';
        else
          var width = '50%';

        $(imgElement).css( 'width', width );
     });
  }catch(e){};

  $('#controls').css({
    'bottom': $('#logos').height() + 'px'
  });
}

function addLogos( logos ){
  logos.forEach(function( logo ){
     var img = document.createElement( 'img' );
     img.onload = reorderLogos;
     img.src = logo;
     document.getElementById( 'logos' ).appendChild( img );
  });
};


var graphController = {

  updateViewSeries: function(){
    var seriesIdsToShow = $('[name="selected_series[]"]:checked')
        .toArray()
        .map(function(ele){ return $(ele).val(); });

    var seriesToShow = this.originalSeries.filter(function(series){
      return seriesIdsToShow.indexOf( series.key ) > -1;
    });

    var args = [ 0, this.graphSeries.length ].concat( seriesToShow );
    [].splice.apply( this.graphSeries, args );
    this.chart.update();
  },
  displaySeries: function(){

    var groupKeys = groups.map(function( group ){ return group.groupKey; });
    var seriesToShow = series.filter(function( singleSeries ){
      for( var i = 0; i < groups.length; i++){
        if( groups[i].groupKey == singleSeries.groupKey ){
          if( ! groups[i].series )
            groups[i].series = [];

          groups[i].series.push( singleSeries );
          return false;
        }
      }

      return true;
    });

    var groupsToShow = groups.filter(function( group ){
      return group.series && group.series.length > 0;
    });

    var html = Templates.get('series')({
      series: seriesToShow,
      groups: groupsToShow,
    });
    $('#series').html( html );

    $('[name="selected_series[]"]').change( this.updateViewSeries.bind( this ) );

  },
  setupBounds: function(){
    function roundsTo2(num){ return Math.round( num * 100 ) / 100; };

    this.chart.on("brush", function(){
      var leftDomain = graphController.chart.y1Axis.domain();
      var rightDomain = graphController.chart.y2Axis.domain();

      $('#left-y-min').attr( 'placeholder', roundsTo2(leftDomain[0]) );
      $('#left-y-max').attr( 'placeholder', roundsTo2(leftDomain[1]) );

      $('#right-y-min').attr( 'placeholder', roundsTo2(rightDomain[0]) );
      $('#right-y-max').attr( 'placeholder', roundsTo2(rightDomain[1]) );
    });

    function valIsNothing(element){ return $(element).val() == ""; };

    function updateValueRange(){
      var y1Domain = [ 'auto', 'auto' ];
      var y2Domain = [ 'auto', 'auto' ];

      if( $('#left-y-min').val() !== "" )
          y1Domain[0] = $('#left-y-min').val();

      if( $('#left-y-max').val() !== "" )
          y1Domain[1] = $('#left-y-max').val();


      if( $('#right-y-min').val() !== "" )
          y2Domain[0] = $('#right-y-min').val();

      if( $('#right-y-max').val() !== "" )
          y2Domain[1] = $('#right-y-max').val();

      graphController.chart.y1Domain( y1Domain );
      graphController.chart.y2Domain( y2Domain );
      graphController.chart.update();
    }

    $('.bounds-holder input').on('keyup change',function(){
      updateValueRange();

      if( $('.bounds-holder input').toArray().some( valIsNothing ) )
        $('#lock-y-axis').prop( "checked", false );
      else
        $('#lock-y-axis').prop( "checked", true );
    });

    $('.bounds-holder input').focus(function(){
      if( valIsNothing( this ) ){
        $(this).val( $(this).attr('placeholder') );
        $('#lock-y-axis').prop( "checked", true );
        updateValueRange();
      }
    });

    $('#lock-y-axis').change(function(){
      if( $( this ).prop('checked') ){
        $('.bounds-holder input').each(function(){
          $(this).val( $(this).attr('placeholder') );
          updateValueRange();
        });
      }else{
        $('.bounds-holder input').each(function(){
          $(this).val( "" );
          updateValueRange();
        });
      }
    });
  },
  init: function(){

    //Add colours
    var color = d3.scale.category20();
    series.forEach(function( seriesSingle, i ){
      if( seriesSingle.color == void(0) )
        seriesSingle.color = color( i );
    });

    this.originalSeries = series;
    this.graphSeries = [].concat(this.originalSeries);
    this.chart =  makeGraph( this.graphSeries );
    //nv.addGraph( this.chart );

    if( request.style && request.style.logos )
      addLogos( request.style.logos );

    // Add the checkbox for the series
    this.displaySeries();

    this.setupBounds();

    //Set all series to show by default
    this.originalSeries.forEach(function( series ){
      series.disabled = false;
    });

    this.updateViewSeries();
    //if( request.plot && request.plot.title )
    //  addTitle( request.plot.title );
  }
};


// Once everything has loaded build the graph
$(function(){
  Templates.init();
  graphController.init();
});