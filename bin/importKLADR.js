/**
 * Created by Данил on 17.02.2017.
 */

/* jshint maxstatements: 100, maxcomplexity: 100*/

const DBF = require('stream-dbf');
const config = require('../config');
const di = require('core/di');
const IonLogger = require('core/impl/log/IonLogger');
const encoding = require('encoding');
const fs = require('fs');

const classNames = {
  STREET: 'STREET@develop-and-test',
  PLACE: 'PLACE@develop-and-test',
  CITY: 'CITY@develop-and-test',
  AREA: 'AREA@develop-and-test',
  REGION: 'REGION@develop-and-test',
  KLADR: 'KLADR@develop-and-test'
};

var sysLog = new IonLogger({});
var scope = null;
var charset = 'cp866';
var sourcePath = null;
var filter = null;
var filterBy = null;

for (var i = 0; i < process.argv.length; i++) {
  if (process.argv[i] === '--sourcePath') {
    sourcePath = process.argv[i + 1];
  } else if (process.argv[i] === '--filter') {
    filter = process.argv[i + 1];
  } else if (process.argv[i] === '--filterBy') {
    filterBy = process.argv[i + 1];
  } else if (process.argv[i] === '--charset') {
    charset = process.argv[i + 1];
  }
}

di('app', config.di,
  {sysLog: sysLog},
  null,
  ['auth', 'rtEvents', 'sessionHandler']
).then(function (s) {

  return new Promise (function (resolve) {
    scope = s;
    var files = [];
    var chain = null;
    fs.readdirSync(sourcePath).forEach(function (file) {
      if (file === 'KLADR.DBF' || file === 'STREET.DBF' || file === 'ADDROBJ.DBF') {
        files.push(file);
      }
    });
    if (files.length > 0) {
      sequenceReadFiles(0);
    } else {
      throw new Error('Указанная директория не содержит необходимых для импорта .DBF-файлов формата КЛАДР либо ФИАС.');
    }

    function sequenceReadFiles(index) {
      console.log('Читается файл ' + files[index]);
      var counter = 0;

      var parser = new DBF(sourcePath + '/' + files[index], {parseTypes: false});
      for (var i = 0; i < parser.header.fields.length; i++) {
        switch (parser.header.fields[i].name) {
          case 'NAME':
          case 'SOCR':
          case 'FORMALNAME':
          case 'SHORTNAME': {
            parser.header.fields[i].raw = true;
          } break;
        }
      }
      var stream = parser.stream;

      stream.on('data', function (record) {
        if (record) {
          if (chain) {
            chain = chain.then(importRecord(record));
          } else {
            chain = importRecord(record)();
          }
          chain = chain.then(function (result) {
            if (!result) {
              counter++;
            }
          });
        }
      });
      stream.on('end', function () {
        // TODO: Тут косяк. Это не конец импорта файла. Тут нужно встраиваться в цепочку
        console.log('Из файла ' + files[index] + ' импортировано ' + counter + ' записей');
        if (index < files.length - 1) {
          sequenceReadFiles(index + 1);
        } else {
          resolve(chain);
        }
      });
    }
  });
}).then(function (chain) {
  return chain;
}).then(function () {
  return checkContainers();
}).then(function () {
  return scope.dataSources.disconnect();
}).then(
  function () {
    console.log('Импорт справочника адресов успешно завершен.');
    process.exit(0);
  }
).catch(function (err) {
  console.error(err);
  var exit = function () { process.exit(130); };
  scope.dataSources.disconnect().then(exit).catch(exit);
});

function importRecord(record) {
  return function () {
    /*var fias = record.hasOwnProperty('NORMDOC');
    var className = getRecordClass(record, fias);
    if (
      className &&
      ((fias && record.ACTSTATUS === '1') || (!fias && record.CODE.substring(record.CODE.length - 2) === '00')) &&
      // TODO: использование фильтра через регулярные выражения очень неэффективно, продумать другой способ
      (!filter || !filterBy || record[filter].search(new RegExp(filterBy)) > -1)
    ) {
      return scope.dataRepo.saveItem(className, null, getData(record, className, fias));
    } else {*/
      return new Promise(function (r) {r();});
    //}
  };
}

function checkContainers(dataRepo) {
  console.log('checkContainers');
  return scope.dataRepo.aggregate(classNames.KLADR, {
    filter: {$empty: 'CONTAINER'},
    aggregates: {$lookup: {from: 'classNames.KLADR', localField: 'CONTAINER', foreignField: 'CODE', as: 'OLOLATION'}}
  }).then(function (result) {
    console.log(result);
  });
}

function getRecordClass(record, fias) {
  if (fias) {
    if (record.STREETCODE && record.STREETCODE !== '0000') {
      return classNames.STREET;
    } else if (record.PLANCODE && record.PLANCODE !== '0000') {
      return null; // TODO: Требует обсуждения, возможно имеет смысл приводить к соседнему уровню
    } else if (record.PLACECODE && record.PLACECODE !== '000') {
      return classNames.PLACE;
    } else if (record.CTARCODE && record.CTARCODE !== '000') {
      return null; // TODO: Требует обсуждения, возможно имеет смысл приводить к соседнему уровню
    } else if (record.CITYCODE && record.CITYCODE !== '000') {
      return classNames.CITY;
    } else if (record.AREACODE && record.AREACODE !== '000') {
      return classNames.AREA;
    } else if (record.AUTOCODE && record.AUTOCODE !== '000') {
      return null; // TODO: Требует обсуждения, возможно имеет смысл приводить к соседнему уровню
    } else if (record.REGIONCODE && record.REGIONCODE !== '00') {
      return classNames.REGION;
    }
  } else {
    if (record.CODE.length === 13) {
      if (record.CODE.substring(2, 11) === '000000000') {
        return classNames.REGION;
      } else if (record.CODE.substring(5, 11) === '000000') {
        return classNames.AREA;
      } else if (record.CODE.substring(8, 11) === '000') {
        return classNames.CITY;
      } else {
        return classNames.PLACE;
      }
    } else if (record.CODE.length === 17) {
      return classNames.STREET;
    }
  }
  return null;
}

function getData(record, className, fias) {
  var data = {};

  if (fias) {
    data.CODE = record.REGIONCODE + record.AREACODE + record.CITYCODE + record.PLACECODE;
    if (className === classNames.STREET) {
      data.CODE = data.CODE + record.STREETCODE;
    }
  } else {
    data.CODE = record.CODE.substring(0, record.CODE.length - 2);
  }

  switch (className) {
    case classNames.STREET: {data.CONTAINER = data.CODE.substring(0, 11);} break;
    case classNames.PLACE: {data.CONTAINER = data.CODE.substring(0, 8) + '000';} break;
    case classNames.CITY: {data.CONTAINER = data.CODE.substring(0, 5) + '000000';} break;
    case classNames.AREA: {data.CONTAINER = data.CODE.substring(0, 2) + '000000000';} break;
  }

  if (fias) {
    data.NAME = convertCharset(record.FORMALNAME);
    data.SOCR = convertCharset(record.SHORTNAME);
    data.INDEX = record.POSTALCODE;
    data.GNINMB = record.IFNSUL.length > 0 ? record.IFNSUL : record.IFNSFL;
    data.UNO = record.TERRIFNSUL.length > 0 ? record.TERRIFNSUL : record.TERRIFNSFL;
    data.OCATD = record.OKATO;
  } else {
    data.NAME = convertCharset(record.NAME);
    data.SOCR = convertCharset(record.SOCR);
    data.INDEX = record.INDEX;
    data.GNINMB = record.GNINMB;
    data.UNO = record.UNO;
    data.OCATD = record.OCATD;
  }

  return data;
}

function convertCharset(text) {
  return encoding.convert(text, 'utf-8', charset).toString();
}
