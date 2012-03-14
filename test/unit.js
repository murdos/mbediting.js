///////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                     MB EDITING TESTS
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////

// Lookup

module("Lookup", {
    setup: function() {
        MB.Editing.constants.MUSICBRAINZ_HOST = 'musicbrainz.org';
    }
});

asyncTest("Work", function() {

    MB.Editing.lookup('work', 'e9bcea25-d0cd-44d6-817b-72aee2f5fc7b', function(entity) {
        equal(entity.mbid, 'e9bcea25-d0cd-44d6-817b-72aee2f5fc7b');
        equal(entity.name, 'Allons z\'enfants');
        equal(entity.comment, 'music by Mouloudji & Assayag');
        equal(entity.iswc, 'T-003.005.306-5');
        equal(entity.type_id, 17);
        equal(entity.type, 'Song');
        start();
    });

});

// Editing

module("Editing", {
    setup: function() {
        MB.Editing.constants.MUSICBRAINZ_HOST = 'test.musicbrainz.org';
    }
});

asyncTest("Creating a work", function() {

    var workInfo = {
        name: 'testWork',
        iswc: 'T-003.094.415-0',
    };
    console.log(workInfo);

    // Creating a new work
    
    MB.Editing.createWork(workInfo, 'edit note', false,
        function (data, textStatus, jqXHR) { 
            var workMBID = $(data).find('h1 a').attr('href').match(MB.Editing.tools.MBID_REGEX)[0];

            MB.Editing.lookup('work', workMBID, function(work) {
                equal(work.name, 'testWork');
                equal(work.iswc, 'T-003.094.415-0');
                start();
            });

            // Then adding composer and lyricist relationships
            var artistMBID = 'd6aae136-da08-4428-b35a-0bf6f3335624'; // Claire Denamur

            MB.Editing.createRelationship('artist', 'work', artistMBID, workMBID, MB.Referential.RELATIONSHIPS.artist.work.composer);
            MB.Editing.createRelationship('artist', 'work', artistMBID, workMBID, MB.Referential.RELATIONSHIPS.artist.work.lyricist);      
        }, 
        function (jqXHR, textStatus, errorThrown) { console.log(errorThrown) }
    );

});

asyncTest("Editing a work", function() {

    var update = {
        name: 'À la belle de moi'
    };

    MB.Editing.editWork('e7d968e0-35a3-3d81-bf6b-3f981a24fd3b', update, '', true,
        function (data, textStatus, jqXHR) {  
        
            MB.Editing.lookup('work', workMBID, function(work) {
                equal(work.name, 'À la belle de moi');
                start();
            });
        
        } 
    );

});

