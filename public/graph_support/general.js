
// Generates unqiue ideas for internal use
var uuid = (function(){
  var count = 1;
  return function(){
    var timestamp = new Date().getTime();
    count++
    return timestamp + '_' + count;
  }
})();

// A simple helper class for storing and generating templates
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

function deserialize( searchString ){
  var o = {};

  ('&' + searchString)
    .replace(
        /&([^\[=&]+)(\[[^\]]*\])?(?:=([^&]*))?/g,
        function (m, $1, $2, $3) {
            if ($2) {
                if (!o[$1]) o[$1] = [];
                o[$1].push($3);
            } else o[$1] = $3;
        }
    );
  return o;
}

// Place to store the settings in the hash header
Settings = {
  // Place to store the settings
  values : {},
  load: function(){
    var hash = window.location.hash;
    if( hash.substr( 0, 1 ) != "#" )
      return false;

    this.values = deserialize( hash.substr(1) );
  },
  // Get a setting by key
  get: function( key ){
    return this.values[key];
  },
  // Set a setting by key and update the hash
  set: function( key, value ){
    this.values[key] = value;
    window.location.hash = decodeURI($.param( this.values ));
    return this.values[key];
  },
  unset: function( key ){
    delete this.values[key];
    window.location.hash = decodeURI($.param( this.values ));
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
  showContextBrushByDefault: function(){
    return true;
  },
  gapThreshold: 2,

  /**
   * This is a support function for `splitAllSeriesOnGap` and does
   * the analysis of the single series.
   * @param  Object series The single input series
   * @return Array[Object]        The multiple output series.
   */
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

  /**
   * This takes in an array of series and splits them them into
   * multiple series if they have missing data points. The threshold
   * for detecting this gap is set above. If a series has points for
   * every day but on e.g., the 25th of June it misses a point, then 
   * it will split that 1 series into 2 with the same attributes but
   * a different array of values.
   * 
   * @param  Array series The array of series to analysis and return
   * @return Array        The new array of series with the data split
   */
  splitAllSeriesOnGap: function( allSeries ){
    var newSeriesList = [];

    for(var i = 0; i < allSeries.length ; i++){
      var series = allSeries[i]
      newSeriesList = newSeriesList.concat( this.splitSeriesOnGap( series ) );
    }
    return newSeriesList;
  },

  /**
   * When called this reads the side panel settings and updates the series
   * being passed into NVD3. After updating those it updates the chart.
   */
  updateViewSeries: function(){
    var seriesIdsToShow = Settings.get('series-ids-shown');

    var seriesToShow = this.originalSeries.filter(function(series){
      return seriesIdsToShow.indexOf( series.key ) > -1;
    });

    if( Settings.get('dont-join-data-gaps') == "true" )
      seriesToShow = this.splitAllSeriesOnGap( seriesToShow );

    var args = [ 0, this.graphSeries.length ].concat( seriesToShow );
    [].splice.apply( this.graphSeries, args );
    this.chart.update();
  },
  displaySeries: function(){
    var groups = this.groups;
    var groupKeys = groups.map(function( group ){ return group.groupKey; });
    var seriesToShow = this.series.filter(function( singleSeries ){
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

    // Set the series to be shown in the header if not set
    if( $.isArray( Settings.get( 'series-ids-shown' ) ) ){
      // Set all to false
      $('[name="selected_series[]"]:checked').prop( 'checked', false );

      // Enable just the ones ask for in the header
      Settings.get( 'series-ids-shown' ).forEach(function( id ){
        $('[id="' + id + '"]').prop( 'checked', true );
      });
    }else{
      //idsToShown header has not been set to create it
      var idsShown = $('[name="selected_series[]"]:checked').map( function(){
          return $(this).val();
        } ).toArray();
      Settings.set( 'series-ids-shown', idsShown );
    }

    var _this = this;
    $('[name="selected_series[]"]').change( function(){
        var idsShown = $('[name="selected_series[]"]:checked').map( function(){
            return $(this).val();
          } ).toArray();
        Settings.set( 'series-ids-shown', idsShown );
        _this.updateViewSeries()
    });

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

    $('.bounds-input-holder input').each(function(){
      var inputKey = $(this).attr('id');
      if( Settings.get( inputKey ) )
        $(this).val( Settings.get( inputKey ) ).addClass('active');
    });
    // Apply updates from setup
    updateValueRange();

    function updateValueRange(){
      var y1Domain = [ 'auto', 'auto' ];
      var y2Domain = [ 'auto', 'auto' ];

      if( Settings.get('left-y-min') )
          y1Domain[0] = Settings.get('left-y-min');

      if( Settings.get('left-y-max') )
          y1Domain[1] = Settings.get('left-y-max');

      if( Settings.get('right-y-min') )
          y2Domain[0] = Settings.get('right-y-min');

      if( Settings.get('right-y-max') )
          y2Domain[1] = Settings.get('right-y-max');

      graphController.chart.y1Domain( y1Domain );
      graphController.chart.y2Domain( y2Domain );
      graphController.chart.update();
    }

    $('.bounds-input-holder input').on('keyup change',function(){
      if( $(this).val() == "" )
        Settings.unset( $(this).attr('id') );
      else  
        Settings.set( $(this).attr('id'), $(this).val() );

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

  /**
   * This prepares the series ensuring they have the attributes they need
   * Currently it ensures each one has a color, label and a key.
   *
   * It then puts this new array of series into this.graphSeries
   * 
   */
  prepareSeries: function(){

    this.series.forEach(function( singleSeries ){
      singleSeries.values.forEach(function( points ){
        points.x = new Date( points.x ).getTime();
      });
    });

    //Add colours
    var color = d3.scale.category20();
    this.series.forEach(function( seriesSingle, i ){
      if( seriesSingle.color == void(0) )
        seriesSingle.color = color( i );

      seriesSingle.label = seriesSingle.label || seriesSingle.key;
      seriesSingle.key = seriesSingle.key || uuid();

    });

    this.originalSeries = this.series;
    this.graphSeries = [].concat(this.originalSeries);
  },

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
    $.ajax({
      url: root + "/nv.d3.css",
      success: function( result ){

        var styleElement = $(document.createElementNS("http://www.w3.org/2000/svg", "style"))
          .attr('type', "text/css")
          .text(result);

        _this.chart.showLegend(true);
        _this.chart.contextChart(false);
        _this.chart.update();

        // Browser needs to apply d3 changes
        setTimeout(finishGraph, 100);

        function finishGraph(){
          var svg = $(container);
          var newSvg = svg
            .clone()
            .attr( 'viewBox', '0 0 '+ svg.width() + " " + svg.height() )
            .css( 'background-color', 'white')
            .attr( 'width', svg.width() )
            .attr( 'height', svg.height() )
            .prepend(styleElement)
            .appendTo('<div>')
            .parent()
            .html();


          _this.chart.showLegend(false);
          _this.chart.contextChart(true);
          _this.chart.update();

          callback( newSvg );
        };
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
        .attr('action', root + "/plots/" + plotId + '/download' )
        .append( $('<input>').attr('type','hidden').attr('name','svg').val( svg ) )
        .appendTo('body')
        .submit();
    };

  },
  error: function( niceErrorMessage, complexLog ){
    console.log( complexLog );
    alert( niceErrorMessage );
  },

  downloadInit: false,
  downloadPopup: function(){ 
    if( this.downloadInit == false ){
      downloadInit = true;
      $('.js-close-download-popup').click(function( e ){
        if( e.target != this )
          return;
        $('.js-download-popup').hide();
      });
      $('.js-download').click( this.download.bind(this) );
    };
    $('.js-download-popup').show();
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
          _this.initChart( data );
        try{
        }catch(e){
          _this.error( "Could not download the data.", e );
        };
      },
      error: function( err ){
        _this.error( "Could not download the data.", err );
      }
    });
  },
  /**
   * Once we have the data this configures the
   * data, starts the ui and builds the graph.
   * @param  {Array} data The array of data from the graph server
   */
  initChart: function( data ){

    this.groups = data.groups;
    this.request = data.request;
    this.series = data.series;

    this.prepareSeries( data )
    this.chart =  makeGraph( this.graphSeries, this.request );
    
    this.chart.showLegend( false );

    if( this.request.plot && this.request.plot.title )
      this.chart.title( this.request.plot.title );

    if( this.request.style && this.request.style.logos )
      addLogos( this.request.style.logos );

    // 
    this.displaySeries();

    this.setupBounds();

    $('#dont-join-data-gaps').change( function(){
      Settings.set('dont-join-data-gaps' , $(this).prop('checked').toString());
      graphController.updateViewSeries()
    } );
    if( Settings.get('dont-join-data-gaps') == "true")
      $('#dont-join-data-gaps').prop( 'checked', true );

    //Set all series to show by default
    this.originalSeries.forEach(function( series ){
      series.disabled = false;
    });

    this.updateViewSeries();
    //
    //  addTitle( request.plot.title );
  }
};


// Once everything has loaded build the graph
$(function(){
  Templates.init();
  graphController.init();
});