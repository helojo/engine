﻿var Path = require('path');
var es = require('event-stream');
var stylish = require('jshint-stylish');
var fs = require('fs');
var through = require('through');

var gulp = require('gulp');
var clean = require('gulp-clean');
var concat = require('gulp-concat');
var gutil = require('gulp-util');
var jshint = require('gulp-jshint');
var qunit = require('gulp-qunit');
var rename = require('gulp-rename');
var uglify = require('gulp-uglify');

var paths = {
    // source
    src: [
        'src/time.js',
        'src/platform/h5Ticker.js',
        'src/platform/h5Engine.js',
    ],
    index: 'src/index.js',

    // ext
    ext_core: [ 
        '../core/bin/**/*.js',
    ],

    // test
    unit_test: 'test/unit/**/*.js',
    runner_template: 'test/lib/runner.html',

    // output
    output: 'bin/',
    engine_dev: 'engine.dev.js',
    engine_min: 'engine.min.js',
};

// clean
gulp.task('clean', function() {
    return gulp.src(output + '*', { read: false })
               .pipe(clean());
});

/////////////////////////////////////////////////////////////////////////////
// copy
/////////////////////////////////////////////////////////////////////////////

gulp.task('cp-core', function() {
    var dest = 'ext/fire-core';
    return gulp.src(paths.ext_core)
               .pipe(gulp.dest(dest));
});

gulp.task('cp-all', ['cp-core' ] );

/////////////////////////////////////////////////////////////////////////////
// build
/////////////////////////////////////////////////////////////////////////////

var delcareFireScope = function (template) {
    var template = fs.readFileSync(template);
    return es.map(function(file, callback) {
        var data = { file: file, contents: file.contents };
        file.contents = new Buffer(gutil.template(template, data));
        callback(null, file);
    });
};

gulp.task('js-dev', function() {
    return gulp.src(paths.src)
               .pipe(jshint())
               .pipe(jshint.reporter(stylish))
               .pipe(concat(paths.engine_dev))
               .pipe(delcareFireScope(paths.index))
               .pipe(gulp.dest(paths.output))
               ;
});

gulp.task('js', ['js-dev'], function() {
    return gulp.src(Path.join(paths.output, paths.engine_dev))
               .pipe(uglify())
               .pipe(rename(paths.engine_min))
               .pipe(gulp.dest(paths.output))
               ;
});

/////////////////////////////////////////////////////////////////////////////
// test
/////////////////////////////////////////////////////////////////////////////

var toFileList = function () {
    var firstFile = null;
    var fileList = [];
    function write(file) {
        if (file.isStream()) return this.emit('error', new PluginError('gulp-concat', 'Streaming not supported'));
        if (!firstFile) firstFile = file;
        fileList.push(file.relative);
    }
    function end() {
        if (firstFile) {
            firstFile.contents = new Buffer(fileList.join(','));
        }
        else {
            firstFile = new gutil.File({
                contents: new Buffer(0),
            });
        }
        this.emit('data', firstFile);
        this.emit('end');
    }
    return through(write, end);
};

var trySortByDepends = function (fileList) {
    var indexInSrc = function (filePath) {
        var basename = Path.basename(filePath);
        for (var i = 0; i < paths.src.length; i++) {
            if (Path.basename(paths.src[i]) === basename) {
                return i;
            }
        }
        return -1;
    };
    fileList.sort(function (lhs, rhs) {
        return compare = indexInSrc(lhs) - indexInSrc(rhs);
    });
}

var generateRunner = function (templatePath, dest) {
    var template = fs.readFileSync(templatePath);
    return es.map(function(file, callback) {
        var fileList = file.contents.toString().split(',');
        trySortByDepends(fileList);
        var scriptElements = '';
        for (var i = 0; i < fileList.length; i++) {
            if (fileList[i]) {
                if (i > 0) {
                    scriptElements += '\n    ';
                }
                scriptElements += ('<script src="' + Path.relative(dest, fileList[i]) + '"></script>');
            }
        }
        var data = { file: file, scripts: scriptElements };
        file.contents = new Buffer(gutil.template(template, data));
        file.path = Path.join(file.base, Path.basename(templatePath));
        callback(null, file);
    });
};

gulp.task('unit-runner', function() {
    var js = [];
    js = js.concat('ext/fire-core/core.min.js');
    js = js.concat(Path.join(paths.output, paths.engine_min));
    js = js.concat(paths.unit_test);

    var dest = paths.unit_test.split('*')[0];
    return gulp.src(js, { read: false, base: './' })
               .pipe(toFileList())
               .pipe(generateRunner(paths.runner_template, dest))
               .pipe(gulp.dest(dest))
               ;
});

gulp.task('test', ['js', 'unit-runner'], function() {
    return gulp.src('test/unit/**/*.html')
               .pipe(qunit())
               .on('error', function(err) {
                   // Make sure failed tests cause gulp to exit non-zero
                   throw err;
               })
               ;
});

/////////////////////////////////////////////////////////////////////////////
// tasks
/////////////////////////////////////////////////////////////////////////////

// watch
gulp.task('watch', function() {
    gulp.watch(paths.ext_core, ['cp-core']).on ( 'error', gutil.log );
    gulp.watch(paths.src.concat(paths.index), ['js-dev']).on ( 'error', gutil.log );
});

// tasks
gulp.task('default', ['cp-all', 'js' ] );
gulp.task('all', ['default', 'test'] );
