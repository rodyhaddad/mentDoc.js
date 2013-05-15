module.exports = function (grunt) {

    grunt.initConfig({
        pkg: grunt.file.readJSON('package.json'),
        destName: 'mentDoc',
        concat: {
            options: {
                separator: ';'
            },
            dist: {
                files: {
                    'dist/<%= destName %>.js': ['src/*.js'],
                    'dist/Markdown-<%= destName %>.js': ['lib/Markdown.*.js', 'src/*.js']
                }
            }
        },
        uglify: {
            options: {
                banner: '/*! <%= pkg.name %> <%= grunt.template.today("dd-mm-yyyy") %> */\n'
            },
            dist: {
                files: {
                    'dist/<%= destName %>.min.js': ['dist/<%= destName %>.js'],
                    'dist/Markdown-<%= destName %>.min.js': ['dist/Markdown-<%= destName %>.js']
                }
            }
        },
        
        jshint: {
            files: ['src/*.js'],
            options: {
                // options here to override JSHint defaults
                globals: {
                    jQuery: true,
                    module: true,
                    document: true
                }
            }
        }
    });

    grunt.loadNpmTasks('grunt-contrib-uglify');
    grunt.loadNpmTasks('grunt-contrib-jshint');
    grunt.loadNpmTasks('grunt-contrib-concat');

    grunt.registerTask('lint', ['jshint']);
    
    grunt.registerTask('minify', ['concat', 'uglify']);

    grunt.registerTask('default', ['jshint', 'concat', 'uglify']);

};