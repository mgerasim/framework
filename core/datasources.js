/**
 * Created by kras on 24.02.16.
 */
'use strict';

var DataSource = require('core/interfaces/DataSource');

function Datasources(conf) {
  /**
   * @type {DataSource[]}
   */
  this.sources = {};

  if (typeof conf.datasources !== 'undefined') {
    for (var i = 0; i < conf.datasources.length; i++) {
      if (typeof conf.datasources[i] === 'object') {
        if (conf.datasources[i].constructor.prototype.constructor.name === 'DataSource') {
          this.sources[nm] = conf.datasources[i];
        } else {
          var nm = conf.datasources[i].name;
          var module = conf.datasources[i].module;
          var constructor = require(module);
          this.sources[nm] = new constructor(conf.datasources[i].config);
        }
      }
    }
  }

  /**
   * @param {String} name
   * @returns {DataSource}
   */
  this.get = function (name) {
    return this.sources[name];
  };

  /**
   * @returns {Promise}
   */
  this.connect = function () {
    var all, i;
    all = [];
    i = 0;
    for (var nm in this.sources) {
      if (nm !== undefined) {
        all[i] = this.sources[nm].open();
        i++;
      }
    }
    return Promise.all(all);
  };

  /**
   * @returns {Promise}
   */
  this.disconnect = function () {
    var all, i;
    all = [];
    i = 0;
    for (var nm in this.sources) {
      if (nm !== undefined) {
        all[i] = this.sources[nm].close();
        i++;
      }
    }
    return Promise.all(all);
  };
}

module.exports = Datasources;