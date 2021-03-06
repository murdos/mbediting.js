///////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                     MB EDITING TESTS
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////

// Lookup

module("Lookup", {
    setup: function() {
        MB.Editing.constants.MUSICBRAINZ_HOST = 'beta.musicbrainz.org';
    }
});

asyncTest("Work", function() {

    MB.Editing.lookup('work', 'e9bcea25-d0cd-44d6-817b-72aee2f5fc7b', '', function(entity) {
        equal(entity.id, 'e9bcea25-d0cd-44d6-817b-72aee2f5fc7b');
        equal(entity.title, 'Allons z\'enfants');
        equal(entity.disambiguation, 'music by Mouloudji & Assayag');
        deepEqual(entity.iswcs, ['T-003.005.306-5']);
        equal(entity.type_id, 17);
        equal(entity.type, 'Song');
        equal(entity.language_id, 134);
        equal(entity.language, 'fra');
        start();
    });

});

// Search

module("Search", {
    setup: function() {
        MB.Editing.constants.MUSICBRAINZ_HOST = 'beta.musicbrainz.org';
    }
});

asyncTest("Work", function() {

    MB.Editing.search('work', 'Allons z\'enfants', function(results) {
        ok(results.work.length > 0);
        entity = results.work[0];
        equal(entity.id, 'e9bcea25-d0cd-44d6-817b-72aee2f5fc7b');
        equal(entity.title, 'Allons z\'enfants');
        equal(entity.score, 100);
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
        name: 'testWork'
    };

    // Creating a new work
    
    MB.Editing.createWork(workInfo, 'edit note', false,
        function (data, textStatus, jqXHR) { 
            var workMBID = $(data).find('h1 a').attr('href').match(MB.Editing.tools.MBID_REGEX)[0];

            MB.Editing.lookup('work', workMBID, function(work) {
                equal(work.name, 'testWork');
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

asyncTest("Adding an ISWC code to an existing work", function() {

    var iswc = 'T-003.094.415-0';

    MB.Editing.addISWC('e7d968e0-35a3-3d81-bf6b-3f981a24fd3b', iswc, '', true,
        function (data, textStatus, jqXHR) {

            MB.Editing.lookup('work', workMBID, function(work) {
                equal(work.name, 'À la belle de moi');
                notEqual(work.iswc.length, 0);
                equal(work.iswc[0], iswc);
                start();
            });

        }
    );

});
