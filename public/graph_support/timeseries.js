
/**
 * Returns a scale from a scale name
 * @param  {String} scaleType The name of the scale you want
 * @return {[Object]}           The D3 scale object
 */
function getScale( scaleType ){
	switch( scaleType ){
		case "time":
			return d3.time.scale();
		case "linear":
			return d3.scale.linear();
		case "log":
			return d3.scale.log();
			break;
	}
}


function autoScale( axis ){

	axis._tickFormatCache = {
		inputDomain: [],
		outputRange: [],
		decimals: 2
	};


   // Function which will check whether if the axis
   // is rendered to {decimals} place, will the axis
	function willDecimalProduceUnqiueList( decimals ){
    	var outputSteps = Math.floor( axis.ticks() );

    	var dataInputStartEnd = axis.scale().domain();
    	var dataInputRange = dataInputStartEnd[1] - dataInputStartEnd[0];
    	var dataInputStep =  dataInputRange / outputSteps;

    	var endAxisValues = [];

    	for( var i = 0 ; i < outputSteps; i++ ){
    		var stepValue = (dataInputStartEnd[0] + ( dataInputStep * i )).toFixed( decimals );
    		if( endAxisValues.indexOf( stepValue ) > -1 )
    			return false;
    		else
    			endAxisValues.push( stepValue );
    	};
    	return true;
	};

	function workoutNewScale(){
    	/*
    	var inputDomain = axis.scale().domain();
    	var inputRange = inputDomain[1] - inputDomain[0];

    	var expo = inputRange.toExponential();
    	var expoEnd = expo.match(/e-(\d+)/);

    	var decimals = 2;
    	if( expoEnd && expoEnd[1] > 2 )
    		decimals = expoEnd[1];
*/
    	var decimals = 2;
    	while( willDecimalProduceUnqiueList(decimals) == false ){
    		decimals++;
    	};
    	axis._tickFormatCache.decimals = decimals;
	}

	return function( d, i ){

    	var inputDomain = axis.scale().domain();
    	var outputRange = axis.scale().range();

    	if( 
    		axis._tickFormatCache.inputDomain[0] != inputDomain[0] || 
    		axis._tickFormatCache.inputDomain[1] != inputDomain[1] || 
    		axis._tickFormatCache.outputRange[0] != outputRange[0] || 
    		axis._tickFormatCache.outputRange[1] != outputRange[1]
    	 )
    		workoutNewScale();


    	return d.toFixed( axis._tickFormatCache.decimals )
    };
};


function makeGraph( series, request ) {

	//Creates a new line graph
	var chart = nv.models.linePlusLineWithFocusChart()
        .margin({top: 60, right: 100, bottom: 100, left: 100})
        .color(d3.scale.category10().range());

    // ----- x Axis setup
    chart.xAxis.axisLabel( request.plot.xAxis.label );
    chart.x2Axis.axisLabel( request.plot.xAxis.label );
    chart.xAxis.scale( getScale( 'time' ) );


    if( request.plot.xAxis.tickFormat !== void(0) )
    	var xAxisTickFormat = request.plot.xAxis.tickFormat;
    else
    	var xAxisTickFormat = '%x';

    chart.xAxis.tickFormat(function(d) {
      return d3.time.format(xAxisTickFormat)(new Date(d))
    });
    chart.x2Axis.tickFormat(function(d) {
      return d3.time.format(xAxisTickFormat)(new Date(d))
    });
    
    if (request.plot.xAxis.ticks !== void(0)) {
    	chart.xAxis.ticks(request.plot.xAxis.ticks);
    	chart.x2Axis.ticks(request.plot.xAxis.ticks);
    }
    
    // ----- left y Axis setup
    chart.y1Axis.axisLabel( request.plot.y1Axis.label );
    
    chart.y1Axis.scale( getScale( request.plot.y1Axis.scale ) );
    chart.y3Axis.scale( getScale( request.plot.y1Axis.scale ) );
    
    if( request.plot.y1Axis.tickFormat !== void(0)  ){

    	if( request.plot.y1Axis.tickFormat == "auto" ){
    		 chart.y1Axis.tickFormat( autoScale( chart.y1Axis ) );
    		 chart.y3Axis.tickFormat( autoScale( chart.y3Axis ) );
    		}else{
		    	var y1AxisTickFormat = request.plot.y1Axis.tickFormat;
				chart.y1Axis.tickFormat( d3.format(y1AxisTickFormat) );
				chart.y3Axis.tickFormat( d3.format(y1AxisTickFormat) );
			};
    }
    
   

    // ----- right y Axis setup
    if( request.plot.y2Axis != void(0) ){

	    chart.y2Axis.axisLabel( request.plot.y2Axis.label );
	    chart.y2Axis.scale( getScale( request.plot.y2Axis.scale ) );
	    
	    if( request.plot.y2Axis.tickFormat !== void(0) ){

	    	if( request.plot.y2Axis.tickFormat == "auto" ){
	    		 chart.y2Axis.tickFormat( autoScale( chart.y2Axis ) );
	    		 chart.y4Axis.tickFormat( autoScale( chart.y4Axis ) );
	    	}else{
		    	var y2AxisTickFormat = request.plot.y2Axis.tickFormat;
				chart.y2Axis.tickFormat( d3.format(y2AxisTickFormat) );
				chart.y4Axis.tickFormat( d3.format(y2AxisTickFormat) );
			};
	    }
    }
	
	d3.select( container)
		.datum( series )
		.transition().duration(500)
		.call(chart);

   
   if( timeseriesController.showContextBrushByDefault() ){
      var min = Infinity;
      var max = 0;
      series.forEach(function( series ){
         series.values.forEach(function( value ){
            value = Number( value.x );
            if( max < value )
               max = value;
            if( min > value )
               min = value;
         });
      });

      // var visibleRange = chart.xAxis.range();
      // var range = min - max;
      // var pointsPerPixel = range / ( visibleRange[1] - visibleRange[0] ) ;
      // var neededPixelsForHandles = 30;
      // var offset  = neededPixelsForHandles * pointsPerPixel;

      chart.brushExtent([ min  , max ])
      chart.update()
   }
   
	
	nv.utils.windowResize(chart.update);
	
	return chart;
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


var timeseriesController = $.extend({}, graphController, {
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

    if( Settings.get('join-data-gaps') != "true" )
      seriesToShow = this.splitAllSeriesOnGap( seriesToShow );

    var args = [ 0, this.graphSeries.length ].concat( seriesToShow );
    [].splice.apply( this.graphSeries, args );
    this.chart.update();
  },
  /**
   * Creates the list of series/series groups that go
   * into the side bar. This creates the html from the 
   * this.groups and this.series arrays and inserts the 
   * html into the sidebar
   */
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
    /**
     * Helper function to round numbers to 2dp 
     * @param  number        Number to rounder
     * @return Number        Rounded number
     */
    function roundsTo2(num){ return Math.round( num * 100 ) / 100; };

    /**
     * Helper function to update the placeholder vales in the y axis locks
     * This function runs every time the graph is updated
     */
    function updateyAxisLockValues(){
      var leftDomain = timeseriesController.chart.y1Axis.domain();
      var rightDomain = timeseriesController.chart.y2Axis.domain();

      $('#left-y-min').attr( 'placeholder', roundsTo2( leftDomain[0]) );
      $('#left-y-max').attr( 'placeholder', roundsTo2( leftDomain[1]) );

      $('#right-y-min').attr( 'placeholder', roundsTo2( rightDomain[0]) );
      $('#right-y-max').attr( 'placeholder', roundsTo2( rightDomain[1]) );
    }
    /**
     * Register function to run on graph update and brush movement
     */
    this.chart.on("update", updateyAxisLockValues );
    this.chart.on("brush.axis_lock", updateyAxisLockValues );

    // Return Y Axis lock values into the inputs if they
    // where in the header
    $('.bounds-input-holder input').each(function(){
      var inputKey = $(this).attr('id');
      if( Settings.get( inputKey ) )
        $(this).val( Settings.get( inputKey ) ).addClass('active');
    });

    updateValueRange();

    /**
     * Helper function that takes the Y Axis lock values from the settings
     * and applys them to the Y Axis domains
     */
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

      timeseriesController.chart.y1Domain( y1Domain );
      timeseriesController.chart.y2Domain( y2Domain );
      timeseriesController.chart.update();
    }

    // When the users edits a Y Axis Lock input update the value
    // in the settings module and update the graph domains
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

    // When someone focuses on an empty Y Axis Lock input
    // populate it with the current place holder
    $('.bounds-input-holder input').focus(function(){
      if( $( this ).val() == "" )
        $(this).val( $(this).attr('placeholder') ).change();
    });

    // When lock icon in the Y Axis Lock input is click
    // toggle the input value on and off
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
    // Convert the string dates to timestamps
    this.series.forEach(function( singleSeries ){
      singleSeries.values.forEach(function( points ){
        points.x = new Date( points.x ).getTime();
      });
    });

    //Add colors to series that dont have colors
    var color = d3.scale.category20();
    this.series.forEach(function( seriesSingle, i ){
      if( seriesSingle.color == void(0) )
        seriesSingle.color = color( i );

      // Make sure the series has a label and key
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
      var inputs = [];

      inputs.push(   );

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
  error: function( niceErrorMessage, complexLog ){
    console.log( complexLog );
    $('body').html( niceErrorMessage );
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
  /**
   * Once we have the data this configures the
   * data, starts the ui and builds the graph.
   * @param  {Array} data The array of data from the graph server
   */
  initChart: function( data ){
    var _this = this;
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

    if( Settings.get('brushExtent') )
      this.chart.brushExtent( Settings.get('brushExtent') );
    
    this.displaySeries();

    this.setupBounds();

    $('#join-data-gaps').change( function(){
      Settings.set('join-data-gaps' , $(this).prop('checked').toString());
      timeseriesController.updateViewSeries()
    } );
    if( Settings.get('join-data-gaps') == "true")
      $('#join-data-gaps').prop( 'checked', true );

    //Set all series to show by default
    this.originalSeries.forEach(function( series ){
      series.disabled = false;
    });

    this.updateViewSeries();


    // Track brush changes and store them in the header
    this.chart.on( 'brush.url', function(){
      var extent = _this.chart.brushExtent();
      if( $.isArray( extent ) )
        Settings.set( 'brushExtent', _this.chart.brushExtent().map(Math.round) );
      else
        Settings.unset( 'brushExtent' );
    });

    this.chart.update();
  }
};


// Once everything has loaded build the graph
$(function(){
  Templates.init();
  timeseriesController.init();
  $('.tooltip').tooltipster()
});