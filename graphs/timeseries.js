var series = <%- JSON.stringify( series ) %>;
var request = <%- JSON.stringify( request ) %>;


var interactive = <%- interactive ? "true":"false" %>;

function capitaliseFirstLetter(string)
{
    return string.charAt(0).toUpperCase() + string.slice(1);
}

window.testState = true;

/**
*
* Due to the way that NVD3 works we must find it the data can be displaed in a valid graph type 
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
		errorMessage = "NVD3 does not have a valid mode that supports " + regex;
	}
	
	
	if( !result )
		return [ false, errorMessage ];
	else
		return [true];
	
	
} 

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

series.forEach(function( singleSeries ){
	singleSeries.values.forEach(function( points ){
		points.x = new Date( points.x ).getTime();
	});
});



function makeGraph() {
	//debugger;
	var chart = nv.models.linePlusLineWithFocusChart()
        .margin({top: 60, right: 100, bottom: 100, left: 100})
       // .x(function( d,i ){ return new Date(d.x) .getTime()})
        .color(d3.scale.category10().range());

    
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
    
    chart.y1Axis.axisLabel( request.plot.y1Axis.label );
    //chart.y3Axis.axisLabel( request.plot.y1Axis.label );
    
    chart.y1Axis.scale( getScale( request.plot.y1Axis.scale ) );
    chart.y3Axis.scale( getScale( request.plot.y1Axis.scale ) );
    
    if( request.plot.y1Axis.tickFormat !== void(0) ){
    	var y1AxisTickFormat = request.plot.y1Axis.tickFormat;
		chart.y1Axis.tickFormat( d3.format(y1AxisTickFormat) );
		chart.y3Axis.tickFormat( d3.format(y1AxisTickFormat) );
    }
    
    if( request.plot.y2Axis != void(0) ){
	    chart.y2Axis.axisLabel( request.plot.y2Axis.label );
	    //chart.y4Axis.axisLabel( request.plot.y2Axis.label );
	    
	    chart.y2Axis.scale( getScale( request.plot.y2Axis.scale ) );
	    //chart.y4Axis.scale( getScale( request.plot.y2Axis.scale ) );
	    
	    if( request.plot.y2Axis.tickFormat !== void(0) ){
	    	var y2AxisTickFormat = request.plot.y2Axis.tickFormat;
			chart.y2Axis.tickFormat( d3.format(y2AxisTickFormat) );
			chart.y4Axis.tickFormat( d3.format(y2AxisTickFormat) );
	    }
    }
	
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