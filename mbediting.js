/*!
* MusicBrainz Editing
*
* Copyright (c) Aurélien Mino
* Available under the LGPL license
*/

var MB = MB || {};
if (!$.error) $.error = function() {};

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                          MusicBrainz Editing helper functions
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////

// ---------------------------------- internal ajax queuing/throttling ------------------------------------ //
// ----------------------------------     Code by bitmap    ------------------------------------ //

function RequestManager(rate) {
    this.queue = [];
    this.last = 0;

    this.next = function() {
        var request = this.queue.shift();
        if (request) {
            request();
            this.last = new Date().getTime();
            if (this.queue.length > 0) {
                setTimeout(function(foo) {foo.next();}, rate, this);
            }
        }
    }

    this.push = function(req) {
        this.queue.push(req);
        if (this.queue.length == 1)
            this.start_queue();
    }

    this.unshift = function(req) {
        this.queue.unshift(req);
        if (this.queue.length == 1)
            this.start_queue();
    }

    this.start_queue = function() {
        var now = new Date().getTime();
        if (now - this.last >= rate) {
            this.next();
        } else {
            setTimeout(function(foo) {foo.next();},
                rate - now + this.last, this);
        }
    }
}

/*
 * Authentification on MusicBrainz is not handled. An open session in the browser is assumed.
 * Warning: Not all of functions are thread-safe.
 *
 */

MB.Editing = (function() {

    var constants = {
        MUSICBRAINZ_HOST: "musicbrainz.org",
        MUSICBRAINZ_SEARCH_HOST: "beta.musicbrainz.org",
        AJAX_REQUEST_RATE: 1000
    };

    var utils = {
        MBID_REGEX: /[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/
    };

    var requestManager = new RequestManager(constants.AJAX_REQUEST_RATE);

    var entity_properties = {
        _common: [ 'title', 'disambiguation' ],
        artist: [],
        work: [ 'type_id', 'language_id', 'iswcs[]' ]
    }

    // ---------------------------------- internal editing functions ------------------------------------ //

    $.each(entity_properties, function(entity, properties) {
        if (entity == "_common") { return true; }
        jQuery.merge( entity_properties[entity], entity_properties['_common'] );
    });

    function fnCreateRelationship (type0, type1, entity0, entity1, linkTypeId, attributes, editnote, autoedit, successFallback, errorFallback) {

        var paramPrefix = 'ar';

        if (!attributes) attributes = {};

        var postAction = "/edit/relationship/create?type0=" + type0 + "&type1=" + type1
            + "&entity0="+entity0+"&entity1="+entity1;
        var postParameters = {};
        appendParameter (postParameters, paramPrefix, "link_type_id", linkTypeId);
        appendParameter (postParameters, paramPrefix, "edit_note", editnote, "");
        appendParameter (postParameters, paramPrefix, "as_auto_editor", autoedit ? 1 : 0);

        $.each(Object.keys(attributes), function(index, attr) {
            appendParameter (postParameters, paramPrefix, "attrs."+attr, attributes[attr]);
        });

        var edit = function() {
            $.ajax({
              type: 'POST',
              url: postAction,
              data: postParameters,
              success: successFallback,
              error: errorFallback
            });
        }
        requestManager.push(edit);
    }

    function fnCreateWork (info, editnote, autoedit, successFallback, errorFallback) {

        var paramPrefix = 'edit-work';

        var postAction = "/work/create";
        var postParameters = {};
        appendParameter (postParameters, paramPrefix, "name", info.name);
        appendParameter (postParameters, paramPrefix, "comment", info.comment);
        appendParameter (postParameters, paramPrefix, "type_id", info.type, "");
        appendParameter (postParameters, paramPrefix, "edit_note", editnote, "");
        appendParameter (postParameters, paramPrefix, "as_auto_editor", autoedit ? 1 : 0);

        var edit = function() {
            $.ajax({
              type: 'POST',
              url: postAction,
              data: postParameters,
              success: successFallback,
              error: errorFallback
            });
        }
        requestManager.push(edit);
    }

    // Helper function, the real edit is done by fnEditEntity
    function fnAddISWC (work_mbid, iswc, editnote, autoedit, successFallback, errorFallback) {
        fnLookupEntity('work', work_mbid, [], function(work) {
            // Check that the ISWC we want to add is not already attached to this work
            for (var i=0; i<work.iswcs.length; i++) {
                if (work.iswcs[i] == iswc) {
                    // Aborting, the edit would be pointless
                    return;
                }
            }
            work.iswcs.push(iswc);
            var update = {
                'iswcs': work.iswcs
            };
            fnEditEntity('work', work_mbid, update, editnote, autoedit, successFallback, errorFallback);
        });
    }

    function fnLookupEntity(entity_type, entity_gid, incOptions, callBack) {
        var wsurl = "http://" + constants.MUSICBRAINZ_HOST + "/ws/2/" + entity_type + "/" + entity_gid;
        $.each(incOptions, function(i,option) {
            wsurl += (i == 0) ? "?inc=" : "+";
            wsurl += option;
        });

        var lookup = function() {
            $.getJSON(wsurl,
                function(entity) {
                    // For each entity type, add id for some properties
                    if (entity_type == 'work') {
                        if (MB.Referential.WORK_TYPES_IDS.hasOwnProperty(entity.type)) {
                            entity['type_id'] = MB.Referential.WORK_TYPES_IDS[ entity.type ];
                        }
                        if (MB.Referential.LANGUAGES_ISO_CODE_TO_IDS.hasOwnProperty(entity.language)) {
                            entity['language_id'] = MB.Referential.LANGUAGES_ISO_CODE_TO_IDS[ entity.language ];
                        }
                    }
                    callBack(entity);
                }
            ).error(function() {
                requestManager.unshift(function() {
                    fnLookupEntity(entity_type, entity_gid, incOptions, callBack);
                });
            });
        }
        requestManager.push(lookup);
    }

    function fnSearchEntity(entity_type, searchString, callBack) {
        var luceneQuery = MB.Editing.Utils.luceneEscape(searchString);
        var searchURL = "http://" + constants.MUSICBRAINZ_SEARCH_HOST + "/ws/2/" + entity_type + "/?fmt=json&query=" + encodeURIComponent(luceneQuery);
        search = function() {
            $.getJSON(searchURL, function(data) {
                callBack(data);
            });
        };
        requestManager.push(search);
    }

    function fnEditEntity (entity_type, entity_gid, update, editnote, autoedit, successFallback, errorFallback) {

        fnLookupEntity(entity_type, entity_gid, [], function(entity) {

            var paramPrefix = 'edit-' + entity_type;

            var postAction = 'http://' + constants.MUSICBRAINZ_HOST + "/" + entity_type + "/" + entity_gid + "/edit";
            var postParameters = {};
            $.each(entity_properties[entity_type], function(index, property) {
                // Multi-values properties (e.g. IPI or ISWC)
                if (property.indexOf("[]",  property.length - "[]".length) !== -1) {
                    property = property.substring(0, property.length - "[]".length);
                    var values = property in update ? update[property] : entity[property];
                    $.each(values, function(idx, value) {
                        appendParameter (postParameters, paramPrefix, property+"."+idx, value, "");
                    });
                } else {
                    formProperty = property;
                    if (property == 'title') formProperty = 'name';
                    if (property == 'disambiguation') formProperty = 'comment';
                    appendParameter (postParameters, paramPrefix, formProperty, property in update ? update[property] : entity[property], "");
                }
            });
            appendParameter (postParameters, paramPrefix, "edit_note", editnote, "");
            appendParameter (postParameters, paramPrefix, "as_auto_editor", autoedit ? 1 : 0, 0);

            var edit = function() {
                $.ajax({
                  type: 'POST',
                  url: postAction,
                  data: postParameters,
                  success: successFallback,
                  error: errorFallback
                }).error(function() {
                    requestManager.unshift(edit);
                });
            }
            requestManager.push(edit);
        });

    }

    function fnEditWork (mbid, update, editnote, autoedit, successFallback, errorFallback) {
        fnEditEntity('work', mbid, update, editnote, autoedit, successFallback, errorFallback);
    }

    function fnEditArtwork (release_gid, artwork_id, type_ids, comment, editnote, autoedit, successFallback, errorFallback) {

        var paramPrefix = 'edit-cover-art';

        var postAction = 'http://' + constants.MUSICBRAINZ_HOST + "/release/" + release_gid + "/edit-cover-art/" + artwork_id;
        var postParameters = {};
        appendParameter (postParameters, paramPrefix, 'type_id', type_ids, []);
        appendParameter (postParameters, paramPrefix, 'comment', comment, "");
        appendParameter (postParameters, paramPrefix, "edit_note", editnote, "");
        appendParameter (postParameters, paramPrefix, "as_auto_editor", autoedit ? 1 : 0, 0);

        var edit = function() {
                $.ajax({
                        type: 'POST',
                        url: postAction,
                        data: postParameters,
                        success: successFallback,
                        error: errorFallback
                });
        }
        requestManager.push(edit);

    }
	
    function approveEdit(edit_id, callback) {
        var url = 'http://' + constants.MUSICBRAINZ_HOST + '/edit/'+edit_id+'/approve'
        var approve = function() {
            $.get(url, function() {
                callback(edit_id);
            }).error(function() {
                requestManager.unshift(approve);
            });
        }
        requestManager.push(approve);

    }

    // ------------------------------------- utils funtions -------------------------------------- //

    function appendParameter(parameters, paramNamePrefix, paramName, paramValue, paramDefaultValue) {
        parameters[ paramNamePrefix + "." + paramName ] = (typeof paramValue === 'undefined') ? paramDefaultValue : paramValue ;
    }

    // ---------------------------------- expose publics here ------------------------------------ //

	return {
        requestManager: requestManager,
        utils: utils,
        constants: constants,
        createRelationship: fnCreateRelationship,
        createWork: fnCreateWork,
        editWork: fnEditWork,
        lookup: fnLookupEntity,
        search: fnSearchEntity,
        addISWC: fnAddISWC,
        approveEdit: approveEdit,
        editArtwork: fnEditArtwork
    };
})();

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                          MusicBrainz Editing tools
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////

MB.Editing.Utils = (function() {
    function luceneEscape(text) {
        var newtext = text.replace(/[-[\]{}()*+?~:\\^!"]/g, "\\$&");
        return newtext.replace("&&", "\&&").replace("||", "\||");
    }

    return {
        luceneEscape: luceneEscape
    }
})();

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                          MusicBrainz Referential
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////

MB.Referential = (function() {

    var RELATIONSHIP_TYPE_IDS = {
        'artist': {
            'work': {
                'composer': 168,
                'lyricist': 165
            }
        },
        'label': {
            'work': {
                'publisher': 'XXX'
            }
        }
    };

    var WORK_TYPES = {
         1: "Aria",
         2: "Ballet",
         3: "Cantata",
         4: "Concerto",
         5: "Sonata",
         6: "Suite",
         7: "Madrigal",
         8: "Mass",
         9: "Motet",
         10: "Opera",
         11: "Oratorio",
         12: "Overture",
         13: "Partita",
         14: "Quartet",
         15: "Song-cycle",
         16: "Symphony",
         17: "Song",
         18: "Symphonic poem",
         19: "Zarzuela",
         20: "Étude"
    };
    var WORK_TYPES_IDS = {};
    $.each(WORK_TYPES, function(id, name) { WORK_TYPES_IDS[name] = id; });

    // select id ||': {"name": "'|| name ||'", "iso_code": "'|| iso_code_2t || '"},' from language where frequency = 2 order by id;
    var LANGUAGES = {
        18: {"name": "Arabic", "iso_code": "ara"},
        76: {"name": "Chinese", "iso_code": "zho"},
        98: {"name": "Czech", "iso_code": "ces"},
        100: {"name": "Danish", "iso_code": "dan"},
        113: {"name": "Dutch", "iso_code": "nld"},
        120: {"name": "English", "iso_code": "eng"},
        131: {"name": "Finnish", "iso_code": "fin"},
        134: {"name": "French", "iso_code": "fra"},
        145: {"name": "German", "iso_code": "deu"},
        159: {"name": "Greek", "iso_code": "ell"},
        195: {"name": "Italian", "iso_code": "ita"},
        198: {"name": "Japanese", "iso_code": "jpn"},
        284: {"name": "[Multiple languages]", "iso_code": "mul"},
        309: {"name": "Norwegian", "iso_code": "nor"},
        338: {"name": "Polish", "iso_code": "pol"},
        340: {"name": "Portuguese", "iso_code": "por"},
        353: {"name": "Russian", "iso_code": "rus"},
        393: {"name": "Spanish", "iso_code": "spa"},
        403: {"name": "Swedish", "iso_code": "swe"},
        433: {"name": "Turkish", "iso_code": "tur"}
    };
    var LANGUAGES_ISO_CODE_TO_IDS = {};
    $.each(LANGUAGES, function(id, lang) { LANGUAGES_ISO_CODE_TO_IDS[lang.iso_code] = id; });

    return {
        LANGUAGES_ISO_CODE_TO_IDS: LANGUAGES_ISO_CODE_TO_IDS,
        LANGUAGES: LANGUAGES,
        RELATIONSHIPS: RELATIONSHIP_TYPE_IDS,
        WORK_TYPES_IDS: WORK_TYPES_IDS,
        WORK_TYPES: WORK_TYPES
    }

})();
