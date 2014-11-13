var uuid = (function(){
  var count = 1;
  return function(){
    var timestamp = new Date().getTime();
    count++
    return timestamp + '_' + count;
  }
})();


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
        else if( ( (logosElementWidth / 2) / imgElement.naturalWidth ) * imgElement.naturalHeight > 150 )
          var width = '25%';
        else
          var width = '50%';

        $(imgElement).css( 'width', width );
     });
  }catch(e){};

  $('#controls').css({
    'bottom': $('#logos').outerHeight() + 'px'
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
  gapThreshold: 2,

  splitSeriesOnGap: function( series ){
    var newSeriesBlocks = []; // place to store value blocks
    var newSeriesBlock = []; //place to store the current block
    var valuesLength = series.values.length - 1; //number of values
    
    for(var i = 0; i <= valuesLength ; i++){

      //Dont check the gap on the first or last value
      newSeriesBlock.push( series.values[i] );
      if( i == 0 || i == valuesLength ) continue;

      // Calculate the last and next gap between the data times
      var lastGap = series.values[i].x - series.values[i-1].x;
      var nextGap = series.values[i+1].x - series.values[i].x;

      // If the gap is over the threshold split it into a new block
      if( nextGap > lastGap * this.gapThreshold ){
        newSeriesBlocks.push( newSeriesBlock );
        newSeriesBlock = [];
      }
    }

    // Add the final block
    newSeriesBlocks.push( newSeriesBlock );

    // Produce a template of the attributes for the current series
    var seriesTemplate = {};
    for( var i in series ){
      if( ! series.hasOwnProperty( i ) || i == 'values' )
        continue;

      seriesTemplate[ i ] = series[i]
    }

    // Turn the blocks into proper sets of series
    return newSeriesBlocks.map(function( block, index ){
      // Merge the template into the new set of values
      var finalSeries = $.extend({}, seriesTemplate );

      finalSeries.values = block;
      finalSeries.key = finalSeries.key + "-p" + index;
      return finalSeries;
    });
       
  },
  splitAllSeriesOnGap: function( allSeries ){
    var newSeriesList = [];

    for(var i = 0; i < allSeries.length ; i++){
      var series = allSeries[i]
      newSeriesList = newSeriesList.concat( this.splitSeriesOnGap( series ) );
    }
    return newSeriesList;
  },
  updateViewSeries: function(){
    var seriesIdsToShow = $('[name="selected_series[]"]:checked')
        .toArray()
        .map(function(ele){ return $(ele).val(); });

    var seriesToShow = this.originalSeries.filter(function(series){
      return seriesIdsToShow.indexOf( series.key ) > -1;
    });

    if( $('#dont-join-data-gaps').prop('checked') )
      seriesToShow = this.splitAllSeriesOnGap( seriesToShow );

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

    //Series meta data toggle
    $('body').on('click', '.js-toggle-meta-information', function(e){
      e.preventDefault();
      var key = $(this).data( 'key' );
      var metaBox = $('[data-key="' + key + '"].js-meta-information');
      metaBox.toggle();
    });

  },
  setupBounds: function(){
    function roundsTo2(num){ return Math.round( num * 100 ) / 100; };
    function updateyAxisLockValues(){
      var leftDomain = graphController.chart.y1Axis.domain();
      var rightDomain = graphController.chart.y2Axis.domain();

      $('#left-y-min').attr( 'placeholder', roundsTo2( leftDomain[0]) );
      $('#left-y-max').attr( 'placeholder', roundsTo2( leftDomain[1]) );

      $('#right-y-min').attr( 'placeholder', roundsTo2( rightDomain[0]) );
      $('#right-y-max').attr( 'placeholder', roundsTo2( rightDomain[1]) );
    }
    this.chart.on("update", updateyAxisLockValues );
    this.chart.on("brush", updateyAxisLockValues );


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

    $('.bounds-input-holder input').on('keyup change',function(){
      updateValueRange();
      if( $(this).val() != "" )
        $(this).addClass('active');
      else
        $(this).removeClass('active');
    });

    $('.bounds-input-holder input').focus(function(){
      if( $( this ).val() == "" )
        $(this).val( $(this).attr('placeholder') ).change();
    });


    $('.bounds-input-holder span').click(function(){
        var input = $(this).prev();
        if( input.val() == "" )
          input.val( input.attr('placeholder') );
        else
          input.val( "" );

        input.change();

    });
  },

  prepareSeries: function(){

    //Add colours
    var color = d3.scale.category20();
    series.forEach(function( seriesSingle, i ){
      if( seriesSingle.color == void(0) )
        seriesSingle.color = color( i );

      seriesSingle.label = seriesSingle.label || seriesSingle.key;
      seriesSingle.key = seriesSingle.key || uuid();

    });

    this.originalSeries = series;
    this.graphSeries = [].concat(this.originalSeries);
  },

  svg: function( callback ){
    // use cached svg
    if( this._svg )
      return callback( this._svg );

    // Get the style sheet and build a SVG
    var _this = this;
    $.ajax({
      url: root + "/nv.d3.css",
      success: function( result ){

        var styleElement = $(document.createElementNS("http://www.w3.org/2000/svg", "style"))
          .attr('type', "text/css")
          .text(result);

        _this.chart.showLegend(true);
        _this.chart.contextChart(false);
        _this.chart.update();

        setTimeout(finishGraph, 100);
        function finishGraph(){
          var svg = $(container)
            .clone()
            .append(styleElement)
            .appendTo('<div>')
            .parent()
            .html();


          _this.chart.showLegend(false);
          _this.chart.contextChart(true);
          _this.chart.update();

          _this._svg = svg;
          callback( svg );
        };
      }
    });
  },
  download: function( format ){
    var _this = this;

    this.svg(startDownload);

    function startDownload( svg ){

      $('<form>')
        .attr('method', 'post')
        .attr('action', root + "/svg-to/" + format )
        .append( $('<input>').attr('type','hidden').attr('name','svg').val( svg ) )
        .appendTo('body')
        .submit();
    };

  },
  init: function(){

    this.prepareSeries()
    this.chart =  makeGraph( this.graphSeries );
    //nv.addGraph( this.chart );
    //
    this.chart.showLegend( false );
    this.chart.title( request.plot.title );

    if( request.style && request.style.logos )
      addLogos( request.style.logos );

    // Add the checkbox for the series
    this.displaySeries();

    this.setupBounds();

    $('#dont-join-data-gaps').change( graphController.updateViewSeries.bind( graphController ) );

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