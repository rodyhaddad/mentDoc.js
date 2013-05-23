module.exports = function(grunt) {

    grunt.initConfig({
    
        // Grab mentDoc.js from raw.github bundled with Markdown
        curl: {
            'js/Markdown-mentDoc.min.js': 'https://raw.github.com/rodyhaddad/mentDoc.js/master/dist/Markdown-mentDoc.min.js'
        },
        
        jshint: {
            files: ['js/main.js'],
            options: {
                // options here to override JSHint defaults
                globals: {
                    jQuery: true,
                    document: true
                }
            }
        }
        
    });
    
    grunt.loadNpmTasks('grunt-contrib-jshint');
    grunt.loadNpmTasks('grunt-curl');
    
    grunt.registerTask('mentDoc.js', ['curl'])
    grunt.registerTask('lint', ['jshint'])
    
    grunt.registerTask('default', ['lint', 'mentDoc.js'])
    
}