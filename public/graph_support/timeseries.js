
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

   
   if( graphController.showContextBrushByDefault() ){
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