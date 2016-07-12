/**
 * Created by Vasiliy Ermilov (email: inkz@xakep.ru, telegram: @inkz1) on 26.04.16.
 */
'use strict';

var DbSync = require('core/interfaces/DbSync');
var debug = require('debug-log')('ION:dbSync');
var mongo = require('mongodb');

function IonDbSync(connection,config){

  var me = this;

  /**
   * @type {string}
   */
  this.metaTableName = "ion_meta";

  /**
   * @type {string}
   */
  this.viewTableName = "ion_view";

  /**
   * @type {string}
   */
  this.navTableName = "ion_nav";

  /**
   * @type {Db}
   */
  this.db = connection;

  if(config.metadata){
    if(config.metadata.MetaTableName){
      this.metaTableName = config.metadata.MetaTableName;
    }
    if(config.metadata.ViewTableName){
      this.viewTableName = config.metadata.ViewTableName;
    }
    if(config.metadata.NavTableName){
      this.navTableName = config.metadata.NavTableName;
    }
  }

  /**
   * @param {object} cm
   * @returns {Promise}
   * @private
   */
  this._createCollection = function(cm){
    return new Promise(function(resolve, reject){
      var collection = me.db.collection(cm.name,function(err, collection){
        if (err){
          return reject(err);
        }
        if (!collection) {
          me.db.createCollection(cm.name).then(resolve).catch(reject);
        } else {
          resolve(collection);
        }
      });
    });
  };

  /**
   * @param {object} cm
   * @private
   */
  this._addIndexes = function(cm){
    /**
     * @param {Collection} collection
     */
    return function(collection){
      var i, promises = [];

      function createIndexPromise(props, unique){
        return new Promise(
          function(resolve, reject) {
            var opts = {}, i;
            if (unique){
              opts.unique = true;
            }

            var indexDef = {};
            if (typeof props === "string") {
              indexDef = props;
            } else if (Array.isArray(props)) {
              for (i = 0; i < props.length; i++) {
                indexDef[props[i]] = 1;
              }
            }
            collection.createIndex(indexDef, opts, function(err, iname){
              /*
              if (err) {
                return reject(err);
              }
              */
              resolve(iname);
            });
          }
        );
      }

      return new Promise(function(resolve, reject){
        var promises = [];
        promises.push(createIndexPromise(cm.key, true));
        promises.push(createIndexPromise("_class", false));

        for (i = 0; i < cm.properties.length; i++) {
          if (cm.properties[i].type === 13 || (cm.properties[i].indexed === true)){
            promises.push(createIndexPromise(cm.properties[i].name, cm.properties[i].unique));
          }
        }

        if (cm.compositeIndexes) {
          for(i = 0; i < cm.compositeIndexes.length; i++) {
            promises.push(createIndexPromise(cm.compositeIndexes[i].properties, cm.compositeIndexes[i].unique));
          }
        }

        Promise.all(promises).
          then(function(inames){
            resolve(collection);
          }).
          catch(reject);
      });
    };
  };

  /**
   * @param {object} cm
   * @returns {Promise}
   */
  function findClassRoot(cm){
    if (!cm.ancestor){
      return new Promise(function(resolve, reject){
        resolve(cm);
      });
    }
    return new Promise(function(resolve, reject) {
      me.db.collection(me.metaTableName, function (err, collection) {
        if (err) {
          return reject(err);
        }
        collection.findOne({name:cm.ancestor}, function(err, anc){
          if (err) {
            return reject(err);
          }
          if (anc) {
            return findClassRoot(anc).then(resolve).catch(reject);
          }
          reject({Error:"Класс " + cm.ancestor + " не найден!"});
        });
      });
    });
  }

  /**
   * @param {object} classMeta
   * @returns {Promise}
   * @private
   */
  this._defineClass = function(classMeta){
    return new Promise(function(resolve, reject) {
      findClassRoot(classMeta).then(function(cm){
        me._createCollection(cm).
          then(me._addIndexes(classMeta)).
          then(function() {
            me.db.collection(me.metaTableName, function (err, collection) {
              if (err) {
                return reject(err);
              }
              collection.insertOne(
                classMeta,
                function (err, result) {
                  if (err) {
                    reject(err);
                  }
                  resolve(result);
                });
            });
          }
        ).catch(reject);
      }).catch(reject);
    });
  };

  this._undefineClass = function(className, version){
    return new Promise(function(resolve, reject) {
      me.db.collection(me.metaTableName, function(err, collection) {
        var query = {name: className};
        if (version) {
          query.version = version;
        }
        collection.remove(query, function (err, cm) {
          if (err) {
            return reject(err);
          }
          resolve(cm);
        });
      });
    });
  };

  this._defineView = function(viewMeta, className, type, path){
    return new Promise(function(resolve, reject) {
        viewMeta.type = type;
        viewMeta.className = className;
        if (path !== null) {
          viewMeta.path = path;
        } else {
          reject(new Error('не передан path'));
        }
        me.db.collection(me.viewTableName, function(err, viewCollection){
          if (err) {
            return reject(err);
          }
          viewCollection.insertOne(viewMeta, function(err, vm){
            if(err){
              return reject(err);
            }
            resolve(vm);
          });
        });
    });
  };

  this._undefineView = function(className, type, path, version){
    return new Promise(function(resolve, reject) {
        me.db.collection(me.viewTableName, function(err, viewCollection){
          if(err){
            reject(err);
          }

          var query = {className: className, type: type, path: path};
          if (version) {
            query.version = version;
          }
          viewCollection.remove(query,function(err,vm){
            if(err){
              reject(err);
            }
            resolve(vm);
          });
        });
    });
  };

  this._defineNavSection = function(navSection){
    return new Promise(function(resolve, reject) {
        me.db.collection(me.navTableName,
          /**
           * @param err
           * @param {Collection} navCollection
           */
          function(err, navCollection){
            navSection.itemType = 'section';
            if(!navSection.nodes){
              navSection.nodes = [];
            }
            navCollection.updateOne({name:navSection.name}, navSection, {upsert: true}, function(err, ns){
              if(err){
                reject(err);
              }
              resolve(ns);
            });
          }
        );
    });
  };

  this._undefineNavSection = function(sectionName){
    return new Promise(function(resolve, reject) {
      me.db.collection(me.navTableName, function(err, navCollection){
        if(err){
          reject(err);
        }
        var query = {name:sectionName};
        navCollection.remove(query,function(err,nsm){
          if(err){
            reject(err);
          }
          resolve(nsm);
        });
      });
    });
  };

  this._defineNavNode = function(navNode,navSectionName){
    return new Promise(function(resolve, reject) {
      me.db.collection(me.navTableName, function(err, navCollection){
        if(err){
          reject(err);
        }
        navNode.itemType = 'node';
        navNode.section = navSectionName;
        navCollection.updateOne({code:navNode.code}, navNode,{upsert: true},function(err, ns){
          if(err){
            reject(err);
          }
          resolve(ns);
        });
      });
    });
  };

  this._undefineNavNode = function(navNodeName){
    return new Promise(function(resolve, reject) {
      me.db.collection(me.navTableName, function(err, navCollection){
        var query = {code:navNodeName};
        navCollection.remove(query,function(err,nnm){
          if(err){
            reject(err);
          }
          resolve(nnm);
        });
      });
    });
  };

}

IonDbSync.prototype = new DbSync();
module.exports = IonDbSync;