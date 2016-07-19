// jscs:disable requireCapitalizedComments
'use strict';

var gulp = require('gulp');
var install = require('gulp-install');

var fs = require('fs');
var path = require('path');
var runSequence = require('run-sequence');

/**
 * Инициализируем первичное приложение.
 * Сначала очищаем папки и устанавливаем все модули
 */
gulp.task('build', function (done) {
  runSequence('build:npm', 'build:bower', function () {
    console.log('Сборка приложения завершена.');
    done();
  });
});

function npm(path) {
  return function () {
    return new Promise(function (resolve, reject) {
      console.log('Установка пакетов бэкенда для пути ' + path);
      try {
        process.chdir(path);
        gulp.src(['./package.json'])
          .pipe(install({production: true})).on('finish', resolve);
      } catch (error) {
        reject(error);
      }
    });
  };
}

function copyResources(src, dest, msg) {
  if (fs.existsSync(src)) {
    return new Promise(function (resolve, reject) {
      gulp.src([path.join(src, '**/*')]).pipe(gulp.dest(dest)).
      on('finish', function () {
        console.log(msg);
        resolve();
      }).
      on('error', reject);
    });
  }
  return false;
}

function copyVendorResources(src, dst, module) {
  var result = false;
  var dist = path.join(src, module, 'dist');
  var min = path.join(src, module, 'min');
  var build = path.join(src, module, 'build');
  var dest = path.join(dst, module);

  result = copyResources(
    dist,
    dest,
    'Скопированы дистрибутивные файлы вендорского пакета ' + module);

  if (!result) {
    result = copyResources(
      build,
      dest,
      'Скопированы дистрибутивные файлы вендорского пакета ' + module);
  }

  if (!result) {
    result = copyResources(
      min,
      dest,
      'Скопированы минифицированные файлы вендорского пакета ' + module);
  }

  if (!result) {
    result = copyResources(
      path.join(src, module),
      dest,
      'Скопированы файлы вендорского пакета ' + module);
  }

  return result;
}

function bower(p) {
  return function () {
    return new Promise(function (resolve, reject) {
      console.log('Установка пакетов фронтенда для пути ' + p);
      try {
        process.chdir(p);
        if (fs.existsSync('.bowerrc')) {
          var bc = JSON.parse(fs.readFileSync('.bowerrc', {encoding: 'utf-8'}));
          gulp.src(['./' + bc.json])
          .pipe(install({args: ['--config.interactive=false']})).on('finish', function () {
            if (fs.existsSync(bc.directory)) {
              var vendorModules = fs.readdirSync(bc.directory);
              var copyers, copyer;
              copyers = [];
              for (var i = 0; i < vendorModules.length; i++) {
                copyer = copyVendorResources(bc.directory, bc.vendorDir, vendorModules[i]);
                if (copyer) {
                  copyers.push(copyer);
                }
              }
              if (copyers.length) {
                Promise.all(copyers).then(resolve).catch(reject);
                return;
              }
            }
            resolve();
          }); // '--offline' - офлайн ускоряет, но ваклит тестировани и сборку
        } else {
          resolve();
        }
      } catch (error) {
        reject(error);
      }
    });
  };
}

gulp.task('build:npm', function (done) {
  var modulesDir = path.join(process.env.NODE_PATH, 'modules');
  var modules = fs.readdirSync(modulesDir);
  var start = npm(process.env.NODE_PATH)();
  var stat;
  for (var i = 0; i < modules.length; i++) {
    stat = fs.statSync(path.join(modulesDir, modules[i]));
    if (stat.isDirectory()) {
      start = start.then(npm(path.join(modulesDir, modules[i])));
    }
  }
  start.then(function () {
    process.chdir(process.env.NODE_PATH);
    done();
  }).catch(function (err) {
    console.error(err);
    done(err);
  });
});

gulp.task('build:bower', function (done) {
  var modulesDir = path.join(process.env.NODE_PATH, 'modules');
  var modules = fs.readdirSync(modulesDir);
  var start = bower(process.env.NODE_PATH)();
  var stat;
  for (var i = 0; i < modules.length; i++) {
    stat = fs.statSync(path.join(modulesDir, modules[i]));
    if (stat.isDirectory()) {
      start = start.then(bower(path.join(modulesDir, modules[i])));
    }
  }
  start.then(function () {
    process.chdir(process.env.NODE_PATH);
    done();
  }).catch(function (err) {
    console.error(err);
    done();
  });
});
