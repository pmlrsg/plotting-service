var start = (new Date);
var webPage = require('webpage');
var system = require('system');
var fs = require('fs');

//  Because phantom doesnt do this on its own for some reason
phantom.onError = function(msg, trace) {
  var msgStack = ['PHANTOM ERROR: ' + msg];
  if (trace && trace.length) {
    msgStack.push('TRACE:');
    trace.forEach(function(t) {
      msgStack.push(' -> ' + (t.file || t.sourceURL) + ': ' + t.line + (t.function ? ' (in function ' + t.function +')' : ''));
    });
  };
  system.stderr.write( msgStack.join('\n') );
  phantom.exit(0);
};

// Get the parameters
var width = null;
var height = null;
var data = null;
var type = null;
var returnType = null;

var inputLength = -1;
var input = "";



while(!system.stdin.atEnd()) {
    input += system.stdin.readLine();
}
gotInput();


function gotInput(){
   try{
      input = JSON.parse( input );
   }catch(e){
      throw new Error( "Input JSON is not valid!" );
   };

   width = input.width;
   height = input.height;
   data = input.data;
   type = input.type;
   returnType = input.returnType;

   go();
}

function go(){
   // Load the webpage
   var page = webPage.create();

   // Include d3 into the run time
   if ( ! page.injectJs( fs.workingDirectory + '/public/d3.js' )) 
      throw new Error( 'Could not load /public/d3.js' );
   
   page.viewportSize = {
     width: Number(width),
     height: Number(height)
   };
   // Inject the function and the parameters
   var svg = page.evaluate(hovmoller, type, data, Number(width), Number(height) );
   var stop = (new Date);
   var randomTemp = '/tmp/' + start.getTime() + '-' + stop.getTime() + '.png';
   
   if( returnType == "svg" ){
      system.stdout.write( svg );
      phantom.exit(0);
   }else if( returnType == "png" ){
      setTimeout(function(){
         system.stdout.write( page.renderBase64('PNG') );
         phantom.exit(0);
      }, 1);
   }else{
      throw new Error( "Return type not valid." );
   };
};


function hovmoller( type, data, overallWidth, overallHeight ) {
   var title = "This is graph";
   var flipAxis = false;
   var trends = data[0];
   var labelCount = 5;
   
   // Set margin for the chart main group svg:g element
   var margin = {top: 20, left: 120, right: 100, bottom: 65};
   
   // Use these defaults to make the overall needed area
   var overall_dims = {
      w : overallWidth,
      h : overallHeight
   };
   var width = overallWidth -  ( margin.left + margin.right );
   var height = overallHeight -  ( margin.top + margin.bottom );
   
   // Create svg element using overall_dims
   var svg = d3.select('body').append('div')
      .append('svg')
      .attr("width", overall_dims.w )
      .attr("height", overall_dims.h )
      .attr("xmlns", "http://www.w3.org/2000/svg" )
      .attr("style", "background-color: white;" )
      .attr("viewBox", "0 0 " + overall_dims.w + " " + overall_dims.h );
   
   // Create main g element to contain graph transform to make 0,0 be inside the margins
   var g = svg.append("g").attr("transform" ,"translate("+[margin.left,margin.top]+")");
   
   

   if (trends.values[0][0].indexOf("Z") > -1)
      var parseDate = d3.time.format("%Y-%m-%dT%H:%M:%SZ").parse;
   else
      var parseDate = d3.time.format("%Y-%m-%dT%H:%M:%S").parse;
   
   var zScale = null,
      xScale = null,
      yScale = null;

   if( title != "" ){
      
   }
   

  if ( flipAxis == false ) {
      // Create basic linear scale for the x, y and z axis.
      zScale = d3.scale.linear();
      xScale = d3.scale.ordinal();
      yScale = d3.time.scale().range([0, height]);
      
      xScale.rangeRoundBands([0, width],  0);
      xScale.domain(trends.values.map(function(d, i) { 
         return d[1];
      }));
      
      yScale.domain(d3.extent(trends.values, function(d) { 
         return parseDate(d[0]);
      })); 
   } else {
      // Create basic linear scale for the x, y and z axis.
      zScale = d3.scale.linear();
      xScale = d3.time.scale().range([0, width]);
      yScale = d3.scale.ordinal();
      
      xScale.domain(d3.extent(trends.values, function(d) { 
         return parseDate(d[0]);
      }));
      
      yScale.rangeRoundBands([0, height],  0);
      yScale.domain(trends.values.map(function(d, i) { 
         return d[1];
      }));
   }

   
   var scale = [];
   var colors = getColorPalette();


   // Add the domain to the zScale - we re map the scale to 
   zScale.domain(
      d3.extent(trends.values, function(trend) {
         return trend[2];
      })
   );

   zScale.range([0, colors.length]);

   var xAxis,
      yAxis;
   
   var myTicks = function(scale) {
      var values = scale.domain();
      var ticks = [];
      for (var i=0; i < values.length; i += Math.round(values.length/labelCount))  {
         ticks.push(values[i]);
      }
      return ticks;
   };
   
   

   if( flipAxis == false ) {
      xAxis = d3.svg.axis()
         .scale(xScale) // set the range of the axis
         .tickSize(10) // height of the ticks
         .orient("bottom")
         .ticks(1)
         .tickValues(myTicks(xScale))
         .tickFormat(function(d,i) { return d.toFixed(2); });

      yAxis = d3.svg.axis()
         .scale(yScale)
         .tickSize(1)
         .orient("left");

   } else {     
      xAxis = d3.svg.axis()
         .scale(xScale)
         .tickSize(1)
         .ticks(6)
         .orient("bottom");
      

      yAxis = d3.svg.axis()
         .scale(yScale) // set the range of the axis
         .tickSize(10) // height of the ticks
         .orient("left")
         .ticks(8)
         .tickValues(myTicks(yScale))
         .tickFormat(function(d,i) { return d.toFixed(2); });
   }

   
      
  // if ( type == 'hovmollerLon' ) {

   var uniqueDatesCount = 0;
   var datesFound = {};
   for( var i = 0 ; trends.values.length > i; i++ ){
      var currentDate = trends.values[i][0];
      if( !( currentDate in datesFound) ){
         uniqueDatesCount++;
         datesFound[ currentDate ] = 1;
      }
   }
   delete datesFound;


   var dateCellSpacing = (height / uniqueDatesCount) * 1.1  ;
   if( dateCellSpacing < 1 )
      dateCellSpacing = 1;

   if( flipAxis == false){
      var oldRage = yScale.range();
      yScale.range( [  oldRage[0] + ( dateCellSpacing / 2 ) ,  oldRage[1] - ( dateCellSpacing / 2 ) ] );
   }else{
      var oldRage = xScale.range();
      xScale.range( [  oldRage[0] + ( dateCellSpacing / 2 ) ,  oldRage[1] - ( dateCellSpacing / 2 ) ] );
   }

   if ( flipAxis == false ) {
      g.append("g")
        .attr("class", "xaxis")
        .attr("transform", "translate(0," + (height- margin.top + 31) + ")")
        .call(xAxis)
        .append("text")
        .attr("y", 30)
        .attr("x", 0 + (width/2) )
        .attr("dy", ".71em")
        .style("text-anchor", "end")
        .text(type == 'hovmollerLon' ? "Longitude":"Latitude");
        
      g.append("g").attr("class", "yaxis");   
      g.select(".yaxis") 
         .call(yAxis)
         .append("text")
         .attr("transform", "rotate(270)")
         .attr("y", -80)
         .attr("x", 0 - (height/2))
         .attr("dy", ".71em")
         .style("text-anchor", "end")
         .text("Time");




      var rects = g.selectAll("rects")
         .data(trends.values)
         .enter()
            .append("rect")
                .attr("x", function(d, i) { return  xScale( d[1] ); })
                .attr("y", function(d, i) { return yScale( parseDate(d[0]) ) - ( dateCellSpacing / 2 ); })
                .attr("class", "graph-rect")
                .attr("width", xScale.rangeBand())
                .attr("height", dateCellSpacing )
                .style("fill", function(d, i) { return colors[Math.round(zScale(d[2]))]; });  
    

   } else {
      g.append("g")
        .attr("class", "xaxis")
        .attr("transform", "translate(0," + (height- margin.top + 31) + ")")
        .call(xAxis)
        .append("text")
        .attr("y", 30)
        .attr("x", 0 + (width/2) )
        .attr("dy", ".71em")
        .style("text-anchor", "end")
        .text("Time");
        
      g.append("g").attr("class", "yaxis");   
      g.select(".yaxis") 
         .call(yAxis)
         .append("text")
         .attr("transform", "rotate(270)")
         .attr("y", -80)
         .attr("x", 0 - (height/2))
         .attr("dy", ".71em")
         .style("text-anchor", "end")
         .text( type == 'hovmollerLon' ? "Longitude":"Latitude" ); 


         
      var rects = g.selectAll("rects")
         .data(trends.values)
         .enter()
            .append("rect")
                .attr("x", function(d, i) { return  xScale( parseDate(d[0]) ) - ( dateCellSpacing / 2 );; })
                .attr("y", function(d, i) { return yScale( d[1] ); })
                .attr("class", "graph-rect")
                .attr("width", dateCellSpacing)
                .attr("height", yScale.rangeBand())
                .style("fill", function(d, i) { 
                   return colorForZValue[ d[2] ]; 
                });
   }


   g.selectAll(".xaxis text").attr("transform", "translate("+width/365/2+",0)");

   /**
    * Takes a z axis value and returns the color
    * that should be shown to the user
    * @param  {int} value      The z-axis value
    * @return {String}         The color in hex or rgb
    */
   function zcolorForValue( value ) {
      return colors[Math.floor(zScale(value))];
   }

   /**
    * Takes a percent used to pick of color for the value
    * based on the range of the data.
    * E.g. Range of data: -10 to 10
    *      Request percentage of 10
    *      Returns the color -9
    *      
    * @param  {int} percentage      The z-axis value
    * @return {String}         The color in hex or rgb
    */
   function zvalueForPercentage( percentage ) {
      var range = zScale.domain()[1] - zScale.domain()[0];
      var x = range / 100;
      return zScale.domain()[0] + (x * percentage);
   }

   function zcolorForPercentage( percentage ) {
      return zcolorForValue( zvalueForPercentage(percentage) );
   }

   // Container for the legend
   var gradient = svg.append("defs").append("linearGradient")
      .attr("id", "gradient")
      .attr("y1", "0%")
      .attr("y1", "0%")
      .attr("y2", "100%")
      .attr("x2", "0%")
      .attr("spreadMethod", "pad");
   
   // Are what distances should <stop> be put in on the gradient bar
   var stopAmounts = [0, 0.5,6.25, 12.5, 18.75, 25, 31.25, 37.5, 43.75, 50, 56.25, 62.5, 68.75, 75, 81.25, 87.5, 93.75, 99.5, 100 ];

   gradient
      .selectAll('stop')
      .data(stopAmounts)
      .enter()
      .append("stop")
         .attr("offset", function(d,i){ return d+'%'; })
         .attr("stop-color", function(d,i){ return zcolorForPercentage(d); })
         .attr("stop-opacity", 1);

   
   svg.append("g").attr("class", "legend_group").append("rect").attr("class", "legend")
      .attr("width", 20)
      .attr("height", height/1.5)
      .attr("style", "fill: url('#gradient');")
      .attr("transform", "translate("+[width + margin.left + 10, height/10]+")");
   
   // 5 legend values
   var legend_data = [0,25,50,75,100].map( zvalueForPercentage );
   
   // Display legend values
   svg.select("g.legend_group").selectAll(".labels")
      .data(legend_data).enter()
      .append("text")
         .text(function(d,i) {
            return Math.ceil(1E3*d)/1E3;
         })
         .attr("class", "labels")
         .attr("transform", function(d,i) {
            return "translate(" + [width + margin.left + 35, ((height/6) * (i-0.5)) + height/5 ] + ")";
         });

   var parent = d3.select(svg.node().parentNode);
   var svgXML = parent.html();

   return svgXML;


   /////// Support functions
   
   function getColorPalette(){
      return [
         "rgb(0,0,0)",
         "rgb(144,0,111)",
         "rgb(141,0,114)",
         "rgb(138,0,117)",
         "rgb(135,0,120)",
         "rgb(132,0,123)",
         "rgb(129,0,126)",
         "rgb(126,0,129)",
         "rgb(123,0,132)",
         "rgb(120,0,135)",
         "rgb(117,0,138)",
         "rgb(114,0,141)",
         "rgb(111,0,144)",
         "rgb(108,0,147)",
         "rgb(105,0,150)",
         "rgb(102,0,153)",
         "rgb(99,0,156)",
         "rgb(96,0,159)",
         "rgb(93,0,162)",
         "rgb(90,0,165)",
         "rgb(87,0,168)",
         "rgb(84,0,171)",
         "rgb(81,0,174)",
         "rgb(78,0,177)",
         "rgb(75,0,180)",
         "rgb(72,0,183)",
         "rgb(69,0,186)",
         "rgb(66,0,189)",
         "rgb(63,0,192)",
         "rgb(60,0,195)",
         "rgb(57,0,198)",
         "rgb(54,0,201)",
         "rgb(51,0,204)",
         "rgb(48,0,207)",
         "rgb(45,0,210)",
         "rgb(42,0,213)",
         "rgb(39,0,216)",
         "rgb(36,0,219)",
         "rgb(33,0,222)",
         "rgb(30,0,225)",
         "rgb(27,0,228)",
         "rgb(24,0,231)",
         "rgb(21,0,234)",
         "rgb(18,0,237)",
         "rgb(15,0,240)",
         "rgb(12,0,243)",
         "rgb(9,0,246)",
         "rgb(6,0,249)",
         "rgb(0,0,252)",
         "rgb(0,0,255)",
         "rgb(0,5,255)",
         "rgb(0,10,255)",
         "rgb(0,16,255)",
         "rgb(0,21,255)",
         "rgb(0,26,255)",
         "rgb(0,32,255)",
         "rgb(0,37,255)",
         "rgb(0,42,255)",
         "rgb(0,48,255)",
         "rgb(0,53,255)",
         "rgb(0,58,255)",
         "rgb(0,64,255)",
         "rgb(0,69,255)",
         "rgb(0,74,255)",
         "rgb(0,80,255)",
         "rgb(0,85,255)",
         "rgb(0,90,255)",
         "rgb(0,96,255)",
         "rgb(0,101,255)",
         "rgb(0,106,255)",
         "rgb(0,112,255)",
         "rgb(0,117,255)",
         "rgb(0,122,255)",
         "rgb(0,128,255)",
         "rgb(0,133,255)",
         "rgb(0,138,255)",
         "rgb(0,144,255)",
         "rgb(0,149,255)",
         "rgb(0,154,255)",
         "rgb(0,160,255)",
         "rgb(0,165,255)",
         "rgb(0,170,255)",
         "rgb(0,176,255)",
         "rgb(0,181,255)",
         "rgb(0,186,255)",
         "rgb(0,192,255)",
         "rgb(0,197,255)",
         "rgb(0,202,255)",
         "rgb(0,208,255)",
         "rgb(0,213,255)",
         "rgb(0,218,255)",
         "rgb(0,224,255)",
         "rgb(0,229,255)",
         "rgb(0,234,255)",
         "rgb(0,240,255)",
         "rgb(0,245,255)",
         "rgb(0,250,255)",
         "rgb(0,255,255)",
         "rgb(0,255,247)",
         "rgb(0,255,239)",
         "rgb(0,255,231)",
         "rgb(0,255,223)",
         "rgb(0,255,215)",
         "rgb(0,255,207)",
         "rgb(0,255,199)",
         "rgb(0,255,191)",
         "rgb(0,255,183)",
         "rgb(0,255,175)",
         "rgb(0,255,167)",
         "rgb(0,255,159)",
         "rgb(0,255,151)",
         "rgb(0,255,143)",
         "rgb(0,255,135)",
         "rgb(0,255,127)",
         "rgb(0,255,119)",
         "rgb(0,255,111)",
         "rgb(0,255,103)",
         "rgb(0,255,95)",
         "rgb(0,255,87)",
         "rgb(0,255,79)",
         "rgb(0,255,71)",
         "rgb(0,255,63)",
         "rgb(0,255,55)",
         "rgb(0,255,47)",
         "rgb(0,255,39)",
         "rgb(0,255,31)",
         "rgb(0,255,23)",
         "rgb(0,255,15)",
         "rgb(0,255,0)",
         "rgb(8,255,0)",
         "rgb(16,255,0)",
         "rgb(24,255,0)",
         "rgb(32,255,0)",
         "rgb(40,255,0)",
         "rgb(48,255,0)",
         "rgb(56,255,0)",
         "rgb(64,255,0)",
         "rgb(72,255,0)",
         "rgb(80,255,0)",
         "rgb(88,255,0)",
         "rgb(96,255,0)",
         "rgb(104,255,0)",
         "rgb(112,255,0)",
         "rgb(120,255,0)",
         "rgb(128,255,0)",
         "rgb(136,255,0)",
         "rgb(144,255,0)",
         "rgb(152,255,0)",
         "rgb(160,255,0)",
         "rgb(168,255,0)",
         "rgb(176,255,0)",
         "rgb(184,255,0)",
         "rgb(192,255,0)",
         "rgb(200,255,0)",
         "rgb(208,255,0)",
         "rgb(216,255,0)",
         "rgb(224,255,0)",
         "rgb(232,255,0)",
         "rgb(240,255,0)",
         "rgb(248,255,0)",
         "rgb(255,255,0)",
         "rgb(255,251,0)",
         "rgb(255,247,0)",
         "rgb(255,243,0)",
         "rgb(255,239,0)",
         "rgb(255,235,0)",
         "rgb(255,231,0)",
         "rgb(255,227,0)",
         "rgb(255,223,0)",
         "rgb(255,219,0)",
         "rgb(255,215,0)",
         "rgb(255,211,0)",
         "rgb(255,207,0)",
         "rgb(255,203,0)",
         "rgb(255,199,0)",
         "rgb(255,195,0)",
         "rgb(255,191,0)",
         "rgb(255,187,0)",
         "rgb(255,183,0)",
         "rgb(255,179,0)",
         "rgb(255,175,0)",
         "rgb(255,171,0)",
         "rgb(255,167,0)",
         "rgb(255,163,0)",
         "rgb(255,159,0)",
         "rgb(255,155,0)",
         "rgb(255,151,0)",
         "rgb(255,147,0)",
         "rgb(255,143,0)",
         "rgb(255,139,0)",
         "rgb(255,135,0)",
         "rgb(255,131,0)",
         "rgb(255,127,0)",
         "rgb(255,123,0)",
         "rgb(255,119,0)",
         "rgb(255,115,0)",
         "rgb(255,111,0)",
         "rgb(255,107,0)",
         "rgb(255,103,0)",
         "rgb(255,99,0)",
         "rgb(255,95,0)",
         "rgb(255,91,0)",
         "rgb(255,87,0)",
         "rgb(255,83,0)",
         "rgb(255,79,0)",
         "rgb(255,75,0)",
         "rgb(255,71,0)",
         "rgb(255,67,0)",
         "rgb(255,63,0)",
         "rgb(255,59,0)",
         "rgb(255,55,0)",
         "rgb(255,51,0)",
         "rgb(255,47,0)",
         "rgb(255,43,0)",
         "rgb(255,39,0)",
         "rgb(255,35,0)",
         "rgb(255,31,0)",
         "rgb(255,27,0)",
         "rgb(255,23,0)",
         "rgb(255,19,0)",
         "rgb(255,15,0)",
         "rgb(255,11,0)",
         "rgb(255,7,0)",
         "rgb(255,3,0)",
         "rgb(255,0,0)",
         "rgb(250,0,0)",
         "rgb(245,0,0)",
         "rgb(240,0,0)",
         "rgb(235,0,0)",
         "rgb(230,0,0)",
         "rgb(225,0,0)",
         "rgb(220,0,0)",
         "rgb(215,0,0)",
         "rgb(210,0,0)",
         "rgb(205,0,0)",
         "rgb(200,0,0)",
         "rgb(195,0,0)",
         "rgb(190,0,0)",
         "rgb(185,0,0)",
         "rgb(180,0,0)",
         "rgb(175,0,0)",
         "rgb(170,0,0)",
         "rgb(165,0,0)",
         "rgb(160,0,0)",
         "rgb(155,0,0)",
         "rgb(150,0,0)",
         "rgb(145,0,0)",
         "rgb(140,0,0)",
         "rgb(135,0,0)",
         "rgb(130,0,0)",
         "rgb(125,0,0)",
         "rgb(120,0,0)",
         "rgb(115,0,0)",
         "rgb(110,0,0)",
         "rgb(105,0,0)",
         "rgb(0,0,0)"
      ];
   }
}

