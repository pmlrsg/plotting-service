
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

