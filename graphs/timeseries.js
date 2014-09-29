
/**
*
* Due to the way that NVD3 works we must find if the data can be displaed in a valid graph type 
*/
window.testData = function(){
	/// Validate the series are correct
	
	var sides = {
		left: null,
		right : null
	}
	
	var errorMessage = "";
	
	var result = series.every(function( series ){
		if( series.yAxis == null ){
			var errorMessage = 'All series must have a yAxis property. Did not : ' + series.key;
			return false;
		}
		if( series.values == null || ! Array.isArray( series.values ) ){
			var errorMessage = 'All series need a set of values Did not : ' + series.key;
			return false;
		}
		if( series.type == null ){
			var errorMessage = 'All series must have a type property. Did not : ' + series.key;
			return false;
		}
		
		if( series.scale === void( 0 ) )
			series.scale = 'linear';
		
		
		if( series.yAxis == 1 ){
			var side = 'left'
		}else if( series.yAxis == 2 ){
			var side = 'right'
		}else{
			var errorMessage = 'All series must have a yAxis property. Did not : ' + series.key;
			return false;
		}
		
		if( sides[side] !== series.type && sides[side] !== null ){
			// Error, the same side whats different types (not doable)
			var errorMessage = 'Each axis of the graph must have exactly one graph type (bar|line|etc..). Did not : ' + series.key;
			return false;
		}else{
			sides[side] = series.type
		}
		return true;
	});
	
	
	if( !result )
		return [ false, errorMessage ];
	
	// Test the needed graph type exists
	
	var nvModels = Object.keys(nv.models);
	
	if( sides.left === null )
		var regex = "[A-Za-z]+Plus" + sides.right + "WithFocusChart"
	else if( sides.right === null )
		var regex =  sides.left +"Plus[A-Za-z]+WithFocusChart"
	else
		var regex = sides.left + "Plus" + sides.right + "WithFocusChart"
	
	regex = new RegExp(regex, 'i');
	
	var validModel = nvModels.some(function( model ){
		return regex.exec( model );
	})
	
	if( ! validModel ){
		result = false;
		errorMessage = "NVD3 does not have a valid model that supports " + regex;
	}
	
	
	if( !result )
		return [ false, errorMessage ];
	else
		return [true];
	
	
} 

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

// For each series convert the x values into timestamps
series.forEach(function( singleSeries ){
	singleSeries.values.forEach(function( points ){
		points.x = new Date( points.x ).getTime();
	});
});

function autoScale( axis ){

	axis._tickFormatCache = {
		inputDomain: [],
		outputRange: [],
		decimals: 2
	};

	function willDecimalProduceUnqiueList( decimals ){

    	//var outputRange = axis.range();
    	//var outputSteps = outputRange / 260;
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


function makeGraph() {

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
	
	// Should the chart show the inactive bar
	// If we are rendering the PNG or SVG then no we shouldnt
	if( ! interactive ){
		chart.contextChart(false);
		chart.contextChartSpacing(false);
	}
	
	d3.select( container)
		.datum( series )
		.transition().duration(500)
		.call(chart);
	
	nv.utils.windowResize(chart.update);
	
	return chart;
};