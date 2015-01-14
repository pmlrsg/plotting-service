/**
 * This script runs in phantom JS
 * It generates a hovmoller and returns in PNG or SVG
 *
 * The script is spawned from node and as the data
 * streamed in and the output streamed out
 */

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

// Stream the input into a file
var input = "";
while(!system.stdin.atEnd()) {
    input += system.stdin.readLine();
}

// Convert the input into JSON
try{
  input = JSON.parse( input );
}catch(e){
  throw new Error( "Input JSON is not valid!" );
};

returnType = input.returnType;

// Run the convert script
convert();

/**
 * To be called once the input variable has the JSON
 * Will actually run the hovmoller function and stream
 * stream it back to the browser
 */
function convert(){
   // Load a empty
   var page = webPage.create();

   // Include d3 into the run time
   if ( ! page.injectJs( fs.workingDirectory + '/public/d3.js' )) 
      throw new Error( 'Could not load /public/d3.js' );

   // Build the hovmoller options from the input
   var options = {
      type: input.type,
      data : input.data,
      title : input.title,
      overallWidth: Number(input.width),
      overallHeight: Number(input.height),
      switchAxis : input['flip-x-y-axis'] == 1 ? true:false,
      flipScalebar : input['reverse-scalebar'] == 1 ? true:false,
      flipYAxis : input['reverse-y-axis'] == 1 ? true:false,
   }

   // Inject the function and the parameters
   var svg = page.evaluate( hovmoller, options );

   // Return the hovmoller in the users request
   // format of fail
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


/**
 * This function gets ran in the phantomjs
 * website window.
 *
 * This function is ran in a DIFFERENT JS RUN TIME
 * the cope from out here and in there is different
 * you can only pass data in through the parameters
 * and out through the return apartment.
 */
function hovmoller( option ) {
   // Calls some basic preload functions located
   // at the end of this function
   preLoad();

   // Copy the options into local variables
   var type = option.type;
   var overallWidth = option.overallWidth;
   var overallHeight = option.overallHeight;
   var switchAxis = option.switchAxis;
   var flipScalebar = option.flipScalebar;
   var flipYAxis = option.flipYAxis;
   var data = option.data;
   var trends = option.data[0];
   var title = option.title;
   
   // Set margin for the chart main group svg:g element
   var margin = {top: 0, left: 0, right: 0, bottom: 0};
   
   // Use these defaults to make the overall needed area
   var overall_dims = {
      w : overallWidth,
      h : overallHeight
   };

   /**
    * Returns the empty width which isn't taken by padding
    */
   function availableWidth(){
      return overallWidth - ( margin.left + margin.right );
   }

   /**
    * Returns the empty height which isn't taken by padding
    */
   function availableHeight(){
      return overallHeight -  ( margin.top + margin.bottom );
   }
   
   // Return the browsers default padding
   d3.select('body').attr('style', 'padding:0px; margin:0px;')

   // Create svg element using 
   var svg = d3.select('body').append('div')
      .append('svg')
      .attr("width", overall_dims.w )
      .attr("height", overall_dims.h )
      .attr("xmlns", "http://www.w3.org/2000/svg" )
      .attr("style", "background-color: white;" )
      .attr("viewBox", "0 0 " + overall_dims.w + " " + overall_dims.h );
   
   // Create main g element to contain graph transform to make 0,0 be inside the margins
   var g = svg.append("g");
   
   // Set the correct date parses
   if (trends.values[0][0].indexOf("Z") > -1)
      var parseDate = d3.time.format("%Y-%m-%dT%H:%M:%SZ").parse;
   else
      var parseDate = d3.time.format("%Y-%m-%dT%H:%M:%S").parse;
   
   var zScale = null,
      xScale = null,
      yScale = null;


   // Add the title
   if( title != "" && title != void(0) ){
      // How much room does the header need
      var titleAreaHeight = 40;
      margin.top += titleAreaHeight;

      // Append the text
      svg.append('text')
         .text(title)
         .attr("x",  overallWidth/2 )
         .attr("y", titleAreaHeight/2 )
         .style("font-size", "24px")
         .style("text-anchor", "middle")
         .attr("dominant-baseline", 'middle');
   }else
      // If theres no title, what padding do we want
      margin.top += 10;

   //----------------------------
   // Prepare the data!

   // Setup the X and Y scales
   // Add the amount of room needed for the axis
   if ( switchAxis == false ) {
      
      // How much room does the x and y axis need ?
      margin.left += 120;
      margin.bottom += 70;
      
      // Setup scales
      zScale = d3.scale.linear();
      xScale = d3.scale.linear();
      yScale = d3.time.scale();
      
      xScale.domain(d3.extent(trends.values, function(d, i) { 
         return d[1];
      }));
      
      yScale.domain(d3.extent(trends.values, function(d) { 
         return parseDate(d[0]);
      }));
   } else {
      // How much room does the x and y axis need ?
      margin.left += 80;
      margin.bottom += 100;
      
      // Setup scales
      zScale = d3.scale.linear();
      xScale = d3.time.scale();
      yScale = d3.scale.linear();
      
      xScale.domain(d3.extent(trends.values, function(d) { 
         return parseDate(d[0]);
      }));

      yScale.domain(d3.extent(trends.values,function(d, i) { 
         return d[1];
      }));
   }

   
   // Setup the Z scale
   var scale = [];
   var colors = getColorPalette();

   zScale.domain(
      d3.extent(trends.values, function(trend) {
         return trend[2];
      })
   );

   zScale.range([0, colors.length]);

   
   //--------------------------------------------
   //              Add the legend
   
   //How much room does the legend needed
   margin.right += 100;

   var legendHeight = (overallHeight - margin.top) * 0.7;
   var legendPadding = 10;
   var legendInnerHeight = legendHeight - legendPadding*2;

   // Container for the legend rainbow
   var gradient = svg.append("defs").append("linearGradient")
      .attr("id", "gradient")
      .attr("y1", "0%")
      .attr("y1", "0%")
      .attr("y2", "100%")
      .attr("x2", "0%")
      .attr("spreadMethod", "pad");
   
   // At what distances should <stop> be put in on the gradient bar
   // (Look at an ouput SVG to get a clear idea of this)
   var stopAmounts = [0, 0.5,6.25, 12.5, 18.75, 25, 31.25, 37.5, 43.75, 50, 56.25, 62.5, 68.75, 75, 81.25, 87.5, 93.75, 99.5, 100 ];


   // Add the legend gradient (not the actually displaying it)
   gradient
      .selectAll('stop')
      .data(stopAmounts)
      .enter()
      .append("stop")
         .attr("offset", function(d,i){ return  d + '%'; })
         .attr("stop-color", function(d,i){ return zcolorForPercentage( ( flipScalebar ? d : 100-d ) ); })
         .attr("stop-opacity", 1);

   // Add a wrapper for the legend
   var legened = svg.append("g")
      .attr('height', legendHeight )
      .attr("class", "legend_group")
      .attr("transform", "translate("+[ overallWidth - margin.right , margin.top ]+")")
   
   // Add the rect that uses the gradient (made above)
   legened.append("rect")
      .attr("class", "legend")
      .attr("width", 20)
      .attr("height", legendInnerHeight )
      .attr("style", "fill: url('#gradient');")
      .attr("transform", "translate(" + [ legendPadding, legendPadding ]+")");
   
   // What legend percentages should be shown 
   var legend_data = [0,25,50,75,100];
   
   // Display legend values
   legened.selectAll(".labels")
      .data(legend_data)
      .enter()
      .append("text")
         .text(function(d,i) {
            return Math.round( 1000 *  zvalueForPercentage(d) ) / 1000;
         })
         .attr("dominant-baseline", 'middle')
         .attr("class", "labels")
         .attr("transform", function(d,i) {
            return "translate(" +[ 35,  legendPadding + legendInnerHeight * ( ( flipScalebar ? d : 100-d ) /100) ] + ")";
         });


   // Calculate range bands for because d3 wont!
   // Note: Range bands only work with linear scales
   // and they have side effects when printing the a scale such as adding huge
   // amounts of paddding.
   // 
   // Calculation it our selves produces better results

   // Count the unique values and work out how big each SVG cell should be
   var uniqueXCount = d3.unique( trends.values, function(x){ return x[switchAxis?0:1] } );
   var cellWidth = (availableWidth() / uniqueXCount) * 1.1;
   if( cellWidth < 1 )
      cellWidth = 1;

   // Same again but on the Y axis
   var uniqueYCount = d3.unique( trends.values, function(x){ return x[switchAxis?1:0] } );
   var cellHeight = (availableHeight() / uniqueYCount) * 1.1;
   if( cellHeight < 1 )
      cellHeight = 1;

   // Add the range removing half the width of cell to account for 
   // that we shift all the cells of 50% so the squares are centers
   var range = [ 0 + (cellWidth/2), availableWidth() - (cellWidth/2) ];
   xScale.range(range);

   // Same again but on the Y axis
   var range = [  availableHeight() - (cellHeight/2), 0 + (cellHeight/2) ];
   if( flipYAxis )
      range.reverse();
   yScale.range(range);

   var xAxis,
      yAxis;
   
   // Display the axis!
   if( switchAxis == false ) {
      xAxis = d3.svg.axis()
         .scale(xScale) // set the range of the axis
         .tickSize(1) // height of the ticks
         .orient("bottom")
         .tickFormat(function(d,i) { return d.toFixed(2); });

      yAxis = d3.svg.axis()
         .scale(yScale)
         .tickSize(1)
         .orient("left")
         .tickFormat(d3.time.format("%d/%m/%Y"));

      // If the graph is small d3 poorly chooses what ticks to show
      // (comment out the code and see if you like), its and issue 
      // to do with d3 choosing `nice` ticks.
      // 
      // Override the default amount of ticks
      if( cellHeight > 40 ){
         yAxis.tickValues(trends.values.map(function(d) { 
            return parseDate(d[0]);
         }));
      }

   } else {     
      xAxis = d3.svg.axis()
         .scale(xScale)
         .tickSize(1)
         .orient("bottom")
         .tickFormat(d3.time.format("%d/%m/%Y"));
      

      // If the graph is small d3 poorly chooses what ticks to show
      // (comment out the code and see if you like), its and issue 
      // to do with d3 choosing `nice` ticks.
      // 
      // Override the default amount of ticks.
      if( cellWidth > 70 ){
         xAxis.tickValues(trends.values.map(function(d) { 
            return parseDate(d[0]);
         }));
      }

      yAxis = d3.svg.axis()
         .scale(yScale) // set the range of the axis
         .tickSize(1) // height of the ticks
         .orient("left")
         .tickFormat(function(d,i) { return d.toFixed(2); });

   }

   
   // Work out what name each axis should have
   if( switchAxis == false ){
      xAxisName = (type == 'hovmollerLon' ? "Longitude":"Latitude");
      yAxisName = "Time";
   }else{
      xAxisName = "Time";
      yAxisName = (type == 'hovmollerLon' ? "Longitude":"Latitude");
   }

   // Add X axis
   var axis = g.append("g")
     .attr("class", "xaxis")
     .attr("transform", "translate(" + [ margin.left, overallHeight - margin.bottom ] + ")")
     .call(xAxis);

   // Rotate X axis labels
   axis.selectAll("text")
      .style("text-anchor", "end")
      .attr("transform", "rotate(-45)");

   // Add X axis label
   axis.append("text")
     .attr("y", margin.bottom - 18)
     .attr("x", 0 + (availableWidth()/2) )
     .style("text-anchor", "middle")
     .style("font-size", "18px")
     .attr("dominant-baseline", 'hanging')
     .text( xAxisName );
   
   // Add Y axis
   var axis = g.append("g")
      .attr("class", "yaxis")
      .attr("transform", "translate(" + [ margin.left, margin.top ] + ")")
      .call(yAxis);

      
   // y axis label
   axis.append("text")
      .attr("transform", "rotate(270)")
      .attr("y", -margin.left + 1)
      .attr("x", 0 - (availableHeight()/2))
      .attr("dominant-baseline", 'text-before-edge')
      .style("font-size", "18px")
      .style("text-anchor", "middle")
      .text( yAxisName );

   // Set the functions for computing the main graph area x and y location
   // This changes depending on what axis is the date and whats the value
   if ( switchAxis == false ) {
      var xFunc = function(d, i) { return  xScale( d[1] ) - ( cellWidth / 2 ); };
      var yFunc = function(d, i) { return yScale( parseDate(d[0]) ) - ( cellHeight / 2 ); };
   } else {
      var xFunc = function(d, i) { return  xScale( parseDate(d[0]) ) - ( cellWidth / 2 ); };
      var yFunc = function(d, i) { return yScale( d[1] ) - ( cellHeight / 2 ); };
   }

   // Put the main graph pixels in
   var rects = g.append('g')
      .attr("transform", "translate(" + [ margin.left, margin.top ] + ")").selectAll("rects")
      .data(trends.values)
      .enter()
         .append("rect")
            .attr("x", xFunc )
            .attr("y", yFunc )
            .attr("class", "graph-rect")
            .attr("width", cellWidth)
            .attr("height", cellHeight)
            .style("fill", function(d, i) { 
               return zcolorForValue( d[2] ); 
            });

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

   /**
    * Wraps the 2 functions above into 1.
    * Allows you to get a percentage and get the color
    * 
    * @param  {int} percentage      The z-axis value
    * @return {String}         The color in hex or rgb
    */
   function zcolorForPercentage( percentage ) {
      return zcolorForValue( zvalueForPercentage(percentage) );
   }

   // Get the SVG XML for what we just made and return it
   var parent = d3.select(svg.node().parentNode);
   var svgXML = parent.html();

   return svgXML;


   /////// Support functions
   
   // Gets the array of colors palettes
   // We could swap this out for other palettes
   // Or a generator function instead of a manually typed array
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

   /**
    * Preload functions. Only has 2 thing right now
    * Adds a `unique` function to d3 to return a 
    * count of unique values
    */
   function preLoad(){
      /**
       * Returns a count of the number of unique values
       * @param  {[type]} array                Array to loop over
       * @param  Function OPTIONAL  accessor   Array accessor method
       * @return int          
       */
      d3.unique = function( array, accessor ){
         accessor = accessor || function(x){ return x };
         var found = {};
         var count = 0;
         for( var i = 0; i < array.length; i++ ){
            var value = accessor( array[i] );
            if( ! ( value in found ) ){
               count++;
               found[value] = 1;
            };
         };
         return count;
      };

   }
}

