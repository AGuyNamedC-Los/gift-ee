/*
	https://www.tengio.com/blog/nunjucks-templates-with-gulp/
	https://medium.com/@andy.neale/nunjucks-a-javascript-template-engine-7731d23eb8cc
	https://github.com/sindresorhus/gulp-nunjucks
	https://www.smashingmagazine.com/2018/03/static-site-with-nunjucks/
	https://www.oreilly.com/ideas/static-site-generators
	
	https://mozilla.github.io/nunjucks/templating.html
*/

var gulp = require('gulp');
var render = require('gulp-nunjucks-render');

gulp.task('nunjucks', function() {
  return gulp.src('./templates/*.html')
  .pipe(render({
      path: ['./templates']
    }))
  .pipe(gulp.dest('./output_templates'))
});