'use strict';

var url = require('url')
  , Path = require('path')
  , Utils = require('./utils')
  , Model = require('./model')
  , DataTypes = require('./data-types')
  , ModelManager = require('./model-manager')
  , QueryInterface = require('./query-interface')
  , Transaction = require('./transaction')
  , QueryTypes = require('./query-types')
  , sequelizeErrors = require('./errors')
  , Promise = require('./promise');

/**
 * This is the main class, the entry point to sequelize. To use it, you just need to import sequelize:
 *
 * ```js
 * var Sequelize = require('sequelize');
 * ```
 *
 * In addition to sequelize, the connection library for the dialect you want to use should also be installed in your project. You don't need to import it however, as sequelize will take care of that.
 *
 * @class Sequelize
 */
module.exports = (function() {

   /**
   * Instantiate sequelize with name of database, username and password
   *
   * #### Example usage
   *
   * ```javascript
   * // without password and options
   * var sequelize = new Sequelize('database', 'username')
   *
   * // without options
   * var sequelize = new Sequelize('database', 'username', 'password')
   *
   * // without password / with blank password
   * var sequelize = new Sequelize('database', 'username', null, {})
   *
   * // with password and options
   * var sequelize = new Sequelize('my_database', 'john', 'doe', {})
   *
   * // with uri (see below)
   * var sequelize = new Sequelize('mysql://localhost:3306/database', {})
   * ```
   *
   * @name Sequelize
   * @constructor
   *
   * @param {String}   database The name of the database
   * @param {String}   [username=null] The username which is used to authenticate against the database.
   * @param {String}   [password=null] The password which is used to authenticate against the database.
   * @param {Object}   [options= {}] An object with options.
   * @param {String}   [options.dialect='mysql'] The dialect you of the database you are connecting to. One of mysql, postgres, sqlite and mariadb
   * @param {String}   [options.dialectModulePath=null] If specified, load the dialect library from this path. For example, if you want to use pg.js instead of pg when connecting to a pg database, you should specify 'pg.js' here
   * @param {String}   [options.storage] Only used by sqlite. Defaults to ':memory:'
   * @param {String}   [options.host='localhost'] The host of the relational database.
   * @param {Integer}  [options.port=] The port of the relational database.
   * @param {String}   [options.protocol='tcp'] The protocol of the relational database.
   * @param {Object}   [options.define= {}] Default options for model definitions. See sequelize.define for options
   * @param {Object}   [options.query= {}] Default options for sequelize.query
   * @param {Object}   [options.sync= {}] Default options for sequelize.sync
   * @param {Function} [options.logging=console.log] A function that gets executed everytime Sequelize would log something.
   * @param {Boolean}  [options.omitNull=false] A flag that defines if null values should be passed to SQL queries or not.
   * @param {Boolean}  [options.queue=true] Queue queries, so that only maxConcurrentQueries number of queries are executing at once. If false, all queries will be executed immediately.
   * @param {int}      [options.maxConcurrentQueries=50] The maximum number of queries that should be executed at once if queue is true.
   * @param {Boolean}  [options.native=false] A flag that defines if native library shall be used or not. Currently only has an effect for postgres
   * @param {Boolean}  [options.replication=false] Use read / write replication. To enable replication, pass an object, with two properties, read and write. Write should be an object (a single server for handling writes), and read an array of object (several servers to handle reads). Each read/write server can have the following properties: `host`, `port`, `username`, `password`, `database`
   * @param {Object}   [options.pool= {}] Should sequelize use a connection pool. Default is true
   * @param {int}      [options.pool.maxConnections]
   * @param {int}      [options.pool.minConnections]
   * @param {int}      [options.pool.maxIdleTime] The maximum time, in milliseconds, that a connection can be idle before being released
   * @param {function} [options.pool.validateConnection] A function that validates a connection. Called with client. The default function checks that client is an object, and that its state is not disconnected

   * @param {Boolean}  [options.quoteIdentifiers=true] Set to `false` to make table names and attributes case-insensitive on Postgres and skip double quoting of them.
  */

  /**
   * Instantiate sequlize with an URI
   * @name Sequelize
   * @constructor
   *
   * @param {String} uri A full database URI
   * @param {object} [options= {}] See above for possible options
  */
  var Sequelize = function(database, username, password, options) {
    var urlParts;
    options = options || {};

    if (arguments.length === 1 || (arguments.length === 2 && typeof username === 'object')) {
      options = username || {};
      urlParts = url.parse(arguments[0]);

      // SQLite don't have DB in connection url
      if (urlParts.pathname) {
        database = urlParts.pathname.replace(/^\//, '');
      }

      options.dialect = urlParts.protocol.replace(/:$/, '');
      options.host = urlParts.hostname;

      if (urlParts.port) {
        options.port = urlParts.port;
      }

      if (urlParts.auth) {
        username = urlParts.auth.split(':')[0];
        password = urlParts.auth.split(':')[1];
      }
    }

    this.options = Utils._.extend({
      dialect: 'mysql',
      dialectModulePath: null,
      host: 'localhost',
      protocol: 'tcp',
      define: {},
      query: {},
      sync: {},
      logging: console.log,
      omitNull: false,
      native: false,
      replication: false,
      ssl: undefined,
      pool: {},
      quoteIdentifiers: true,
      language: 'en'
    }, options || {});

    if (this.options.dialect === 'postgresql') {
      this.options.dialect = 'postgres';
    }

    if (this.options.logging === true) {
      console.log('DEPRECATION WARNING: The logging-option should be either a function or false. Default: console.log');
      this.options.logging = console.log;
    }

    this.config = {
      database: database,
      username: username,
      password: (((['', null, false].indexOf(password) > -1) || (typeof password === 'undefined')) ? null : password),
      host: this.options.host,
      port: this.options.port,
      pool: this.options.pool,
      protocol: this.options.protocol,
      queue: this.options.queue,
      native: this.options.native,
      ssl: this.options.ssl,
      replication: this.options.replication,
      dialectModulePath: this.options.dialectModulePath,
      maxConcurrentQueries: this.options.maxConcurrentQueries,
      dialectOptions: this.options.dialectOptions
    };

    try {
      var Dialect = require('./dialects/' + this.getDialect());
      this.dialect = new Dialect(this);
    } catch (err) {
      throw new Error('The dialect ' + this.getDialect() + ' is not supported. ('+err+')');
    }

    /**
     * Models are stored here under the name given to `sequelize.define`
     * @property models
     */
    this.models = {};
    this.modelManager = this.daoFactoryManager = new ModelManager(this);
    this.connectionManager = this.dialect.connectionManager;

    this.importCache = {};
  };

  /**
   * A reference to sequelize utilities. Most users will not need to use these utils directly. However, you might want to use `Sequelize.Utils._`, which is a reference to the lodash library, if you don't already have it imported in your project.
   * @property Utils
   * @see {Utils}
   */
  Sequelize.prototype.Utils = Sequelize.Utils = Utils;

  /**
   * A modified version of bluebird promises, that allows listening for sql events
   * @property Promise
   * @see {Promise}
   */
  Sequelize.prototype.Promise = Sequelize.Promise = Promise;

  Sequelize.QueryTypes = QueryTypes;

  /**
   * Exposes the validator.js object, so you can extend it with custom validation functions. The validator is exposed both on the instance, and on the constructor.
   * @property Validator
   * @see https://github.com/chriso/validator.js
   */
  Sequelize.prototype.Validator = Sequelize.Validator = require('validator');

  Sequelize.prototype.Model = Sequelize.Model = Model;

  for (var dataType in DataTypes) {
    Sequelize[dataType] = DataTypes[dataType];
  }

  Object.defineProperty(Sequelize.prototype, 'connectorManager', {
    get: function() {
      return this.transactionManager.getConnectorManager();
    }
  });

  /**
   * A reference to the sequelize transaction class. Use this to access isolationLevels when creating a transaction
   * @property Transaction
   * @see {Transaction}
   * @see {Sequelize#transaction}
   */
  Sequelize.prototype.Transaction = Transaction;

  /**
   * A general error class
   * @property Error
   */
  Sequelize.prototype.Error = Sequelize.Error =
    sequelizeErrors.BaseError;

  /**
   * Emitted when a validation fails
   * @property ValidationError
   */
  Sequelize.prototype.ValidationError = Sequelize.ValidationError =
    sequelizeErrors.ValidationError;

  /**
   * Returns the specified dialect.
   *
   * @return {String} The specified dialect.
   */
  Sequelize.prototype.getDialect = function() {
    return this.options.dialect;
  };

  /**
   * Returns an instance of QueryInterface.

   * @method getQueryInterface
   * @return {QueryInterface} An instance (singleton) of QueryInterface.
   *
   * @see {QueryInterface}
   */
  Sequelize.prototype.getQueryInterface = function() {
    this.queryInterface = this.queryInterface || new QueryInterface(this);
    return this.queryInterface;
  };

  /**
   * Returns an instance (singleton) of Migrator.
   *
   * @see {Migrator}
   * @function getMigrator
   * @param {Object} [options= {}] See Migrator for options
   * @param {Boolean} [force=false] A flag that defines if the migrator should get instantiated or not.
   * @return {Migrator} An instance of Migrator.
   */
  Sequelize.prototype.getMigrator = function(options, force) {
    var Migrator = require('./migrator');

    if (force) {
      this.migrator = new Migrator(this, options);
    } else {
      this.migrator = this.migrator || new Migrator(this, options);
    }

    return this.migrator;
  };

  /**
   * Define a new model, representing a table in the DB.
   *
   * The table columns are define by the hash that is given as the second argument. Each attribute of the hash represents a column. A short table definition might look like this:
   *
   * ```js
   * sequelize.define('modelName', {
   *     columnA: {
   *         type: Sequelize.BOOLEAN,
   *         validate: {
   *           is: ["[a-z]",'i'],        // will only allow letters
   *           max: 23,                  // only allow values <= 23
   *           isIn: {
   *             args: [['en', 'zh']],
   *             msg: "Must be English or Chinese"
   *           }
   *         },
   *         field: 'column_a'
   *         // Other attributes here
   *     },
   *     columnB: Sequelize.STRING,
   *     columnC: 'MY VERY OWN COLUMN TYPE'
   * })
   *
   * sequelize.models.modelName // The model will now be available in models under the name given to define
   * ```
   *
   *
   * As shown above, column definitions can be either strings, a reference to one of the datatypes that are predefined on the Sequelize constructor, or an object that allows you to specify both the type of the column, and other attributes such as default values, foreign key constraints and custom setters and getters.
   *
   * For a list of possible data types, see http://sequelizejs.com/docs/latest/models#data-types
   *
   * For more about getters and setters, see http://sequelizejs.com/docs/latest/models#getters---setters
   *
   * For more about instance and class methods, see http://sequelizejs.com/docs/latest/models#expansion-of-models
   *
   * For more about validation, see http://sequelizejs.com/docs/latest/models#validations
   *
   * @see {DataTypes}
   * @see {Hooks}
   * @param {String}                  modelName The name of the model. The model will be stored in `sequelize.models` under this name
   * @param {Object}                  attributes An object, where each attribute is a column of the table. Each column can be either a DataType, a string or a type-description object, with the properties described below:
   * @param {String|DataType|Object}  attributes.column The description of a database column
   * @param {String|DataType}         attributes.column.type A string or a data type
   * @param {Boolean}                 [attributes.column.allowNull=true] If false, the column will have a NOT NULL constraint, and a not null validation will be run before an instance is saved.
   * @param {Any}                     [attributes.column.defaultValue=null] A literal default value, a javascript function, or an SQL function (see `sequelize.fn`)
   * @param {String|Boolean}          [attributes.column.unique=false] If true, the column will get a unique constraint. If a string is provided, the column will be part of a composite unique index. If multiple columns have the same string, they will be part of the same unique index
   * @param {Boolean}                 [attributes.column.primaryKey=false]
   * @param {String}                  [attributes.column.field=null] If set, sequelize will map the attribute name to a different name in the database
   * @param {Boolean}                 [attributes.column.autoIncrement=false]
   * @param {String}                  [attributes.column.comment=null]
   * @param {String|Model}            [attributes.column.references] If this column references another table, provide it here as a Model, or a string
   * @param {String}                  [attributes.column.referencesKey='id'] The column of the foreign table that this column references
   * @param {String}                  [attributes.column.onUpdate] What should happen when the referenced key is updated. One of CASCADE, RESTRICT, SET DEFAULT, SET NULL or NO ACTION
   * @param {String}                  [attributes.column.onDelete] What should happen when the referenced key is deleted. One of CASCADE, RESTRICT, SET DEFAULT, SET NULL or NO ACTION
   * @param {Function}                [attributes.column.get] Provide a custom getter for this column. Use `this.getDataValue(String)` to manipulate the underlying values.
   * @param {Function}                [attributes.column.set] Provide a custom setter for this column. Use `this.setDataValue(String, Value)` to manipulate the underlying values.
   * @param {Object}                  [attributes.validate] An object of validations to execute for this column every time the model is saved. Can be either the name of a validation provided by validator.js, a validation function provided by extending validator.js (see the `DAOValidator` property for more details), or a custom validation function. Custom validation functions are called with the value of the field, and can possibly take a second callback argument, to signal that they are asynchronous. If the validator is sync, it should throw in the case of a failed validation, it it is async, the callback should be called with the error text.

   * @param {Object}                  [options] These options are merged with the default define options provided to the Sequelize constructor
   * @param {Object}                  [options.defaultScope] Define the default search scope to use for this model. Scopes have the same form as the options passed to find / findAll
   * @param {Object}                  [options.scopes] More scopes, defined in the same way as defaultScope above. See `Model.scope` for more information about how scopes are defined, and what you can do with them
   * @param {Boolean}                 [options.omitNull] Don't persits null values. This means that all columns with null values will not be saved
   * @param {Boolean}                 [options.timestamps=true] Adds createdAt and updatedAt timestamps to the model.
   * @param {Boolean}                 [options.paranoid=false] Calling `destroy` will not delete the model, but instead set a `deletedAt` timestamp if this is true. Needs `timestamps=true` to work
   * @param {Boolean}                 [options.underscored=false] Converts all camelCased columns to underscored if true
   * @param {Boolean}                 [options.underscoredAll=false] Converts camelCased model names to underscored tablenames if true
   * @param {Boolean}                 [options.freezeTableName=false] If freezeTableName is true, sequelize will not try to alter the DAO name to get the table name. Otherwise, the dao name will be pluralized
   * @param {String|Boolean}          [options.createdAt] Override the name of the createdAt column if a string is provided, or disable it if false. Timestamps must be true
   * @param {String|Boolean}          [options.updatedAt] Override the name of the updatedAt column if a string is provided, or disable it if false. Timestamps must be true
   * @param {String|Boolean}          [options.deletedAt] Override the name of the deletedAt column if a string is provided, or disable it if false. Timestamps must be true
   * @param {String}                  [options.tableName] Defaults to pluralized model name, unless freezeTableName is true, in which case it uses model name verbatim
   * @param {Object}                  [options.getterMethods] Provide getter functions that work like those defined per column. If you provide a getter method with the same name as a column, it will be used to access the value of that column. If you provide a name that does not match a column, this function will act as a virtual getter, that can fetch multiple other values
   * @param {Object}                  [options.setterMethods] Provide setter functions that work like those defined per column. If you provide a setter method with the same name as a column, it will be used to update the value of that column. If you provide a name that does not match a column, this function will act as a virtual setter, that can act on and set other values, but will not be persisted
   * @param {Object}                  [options.instanceMethods] Provide functions that are added to each instance (DAO)
   * @param {Object}                  [options.classMethods] Provide functions that are added to the model (Model)
   * @param {String}                  [options.schema='public']
   * @param {String}                  [options.engine]
   * @param {String}                  [options.charset]
   * @param {String}                  [options.comment]
   * @param {String}                  [options.collate]
   * @param {Object}                  [options.hooks] An object of hook function that are called before and after certain lifecycle events. The possible hooks are: beforeValidate, afterValidate, beforeBulkCreate, beforeBulkDestroy, beforeBulkUpdate, beforeCreate, beforeDestroy, beforeUpdate, afterCreate, afterDestroy, afterUpdate, afterBulkCreate, afterBulkDestory and afterBulkUpdate. See Hooks for more information about hook functions and their signatures. Each property can either be a function, or an array of functions.
   * @param {Object}                  [options.validate] An object of model wide validations. Validations have access to all model values via `this`. If the validator function takes an argument, it is asumed to be async, and is called with a callback that accepts an optional error.
   *
   * @return {Model}
   */
  Sequelize.prototype.define = function(modelName, attributes, options) {
    options = options || {};
    var self = this
      , globalOptions = this.options;

    if (globalOptions.define) {
      options = Utils._.extend({}, globalOptions.define, options);
      Utils._(['classMethods', 'instanceMethods']).each(function(key) {
        if (globalOptions.define[key]) {
          options[key] = options[key] || {};
          Utils._.defaults(options[key], globalOptions.define[key]);
        }
      });
    }

    options.omitNull = globalOptions.omitNull;
    options.language = globalOptions.language;

    // if you call "define" multiple times for the same modelName, do not clutter the factory
    if (this.isDefined(modelName)) {
      this.modelManager.removeDAO(this.modelManager.getDAO(modelName));
    }

    options.sequelize = this;
    var factory = new Model(modelName, attributes, options);
    this.modelManager.addDAO(factory.init(this.modelManager));

    return factory;
  };

  /**
   * Fetch a DAO factory which is already defined
   *
   * @param {String} modelName The name of a model defined with Sequelize.define
   * @throws Will throw an error if the DAO is not define (that is, if sequelize#isDefined returns false)
   * @return {Model}
   */
  Sequelize.prototype.model = function(modelName) {
    if (!this.isDefined(modelName)) {
      throw new Error(modelName + ' has not been defined');
    }

    return this.modelManager.getDAO(modelName);
  };

  /**
   * Checks whether a model with the given name is defined
   *
   * @param {String} modelName The name of a model defined with Sequelize.define
   * @return {Boolean}
   */
  Sequelize.prototype.isDefined = function(modelName) {
    var daos = this.modelManager.daos;
    return (daos.filter(function(dao) { return dao.name === modelName; }).length !== 0);
  };

  /**
   * Imports a model defined in another file
   *
   * Imported models are cached, so multiple calls to import with the same path will not load the file multiple times
   *
   * See https://github.com/sequelize/sequelize/blob/master/examples/using-multiple-model-files/Task.js for a short example of how to define your models in separate files so that they can be imported by sequelize.import
   * @param {String} path The path to the file that holds the model you want to import. If the part is relative, it will be resolved relatively to the calling file
   * @return {Model}
   */
  Sequelize.prototype.import = function(path) {
    // is it a relative path?
    if(Path.normalize(path) !== Path.resolve(path)){
      // make path relative to the caller
      var callerFilename = Utils.stack()[1].getFileName()
        , callerPath = Path.dirname(callerFilename);

      path = Path.resolve(callerPath, path);
    }

    if (!this.importCache[path]) {
      var defineCall = (arguments.length > 1 ? arguments[1] : require(path));
      this.importCache[path] = defineCall(this, DataTypes);
    }

    return this.importCache[path];
  };

  Sequelize.prototype.migrate = function(options) {
    return this.getMigrator().migrate(options);
  };

  /**
   * Execute a query on the DB, with the posibility to bypass all the sequelize goodness.
   *
   * If you do not provide other arguments than the SQL, raw will be assumed to the true, and sequelize will not try to do any formatting to the results of the query.
   *
   * @method query
   * @param {String} sql
   * @param {Model}  [callee] If callee is provided, the selected data will be used to build an instance of the DAO represented by the factory. Equivalent to calling Model.build with the values provided by the query.
   * @param {Object}      [options= {}] Query options.
   * @param {Boolean}     [options.raw] If true, sequelize will not try to format the results of the query, or build an instance of a model from the result
   * @param {Transaction} [options.transaction=null] The transaction that the query should be executed under
   * @param [String]      [options.type='SELECT'] The type of query you are executing. The query type affects how results are formatted before they are passed back. If no type is provided sequelize will try to guess the right type based on the sql, and fall back to SELECT. The type is a string, but `Sequelize.QueryTypes` is provided is convenience shortcuts. Current options are SELECT, BULKUPDATE and BULKDELETE
   * @param {Object|Array} [replacements] Either an object of named parameter replacements in the format `:param` or an array of unnamed replacements to replace `?` in your SQL.
   * @return {Promise}
   *
   * @see {Model#build} for more information about callee.
   */
  Sequelize.prototype.query = function(sql, callee, options, replacements) {
    var self = this;

    if (arguments.length === 4) {
      if (Array.isArray(replacements)) {
        sql = Utils.format([sql].concat(replacements), this.options.dialect);
      }
      else {
        sql = Utils.formatNamedParameters(sql, replacements, this.options.dialect);
      }
    } else if (arguments.length === 3) {
      options = options;
    } else if (arguments.length === 2) {
      options = {};
    } else {
      options = { raw: true };
    }

    options = Utils._.extend(Utils._.clone(this.options.query), options);
    options = Utils._.defaults(options, {
      logging: this.options.hasOwnProperty('logging') ? this.options.logging : console.log,
      type: (sql.toLowerCase().indexOf('select') === 0) ? QueryTypes.SELECT : false
    });

    return Promise.resolve(
      options.transaction ? options.transaction.connection : self.connectionManager.getConnection()
    ).then(function (connection) {
      var query = new self.dialect.Query(connection, self, callee, options);
      return query.run(sql).finally(function() {
        if (options.transaction) return;
        return self.connectionManager.releaseConnection(connection);
      });
    });
  };

  /**
   * Create a new database schema.
   *
   * Note,that this is a schema in the [postgres sense of the word](http://www.postgresql.org/docs/9.1/static/ddl-schemas.html),
   * not a database table. In mysql and sqlite, this command will do nothing.
   * 
   * @see {Model#schema}
   * @param {String} schema Name of the schema
   * @return {Promise}
   */
  Sequelize.prototype.createSchema = function(schema) {
    return this.getQueryInterface().createSchema(schema);
  };

  /**
   * Show all defined schemas
   * 
   * Note,that this is a schema in the [postgres sense of the word](http://www.postgresql.org/docs/9.1/static/ddl-schemas.html),
   * not a database table. In mysql and sqlite, this will show all tables.
   * @return {Promise}
   */
  Sequelize.prototype.showAllSchemas = function() {
    return this.getQueryInterface().showAllSchemas();
  };

  /**
   * Drop a single schema
   *
   * Note,that this is a schema in the [postgres sense of the word](http://www.postgresql.org/docs/9.1/static/ddl-schemas.html),
   * not a database table. In mysql and sqlite, this drop a table matching the schema name
   * @param {String} schema Name of the schema
   * @return {Promise}
   */
  Sequelize.prototype.dropSchema = function(schema) {
    return this.getQueryInterface().dropSchema(schema);
  };

  /**
   * Drop all schemas
   *
   * Note,that this is a schema in the [postgres sense of the word](http://www.postgresql.org/docs/9.1/static/ddl-schemas.html),
   * not a database table. In mysql and sqlite, this is the equivalent of drop all tables.
   * @return {Promise}
   */
  Sequelize.prototype.dropAllSchemas = function() {
    return this.getQueryInterface().dropAllSchemas();
  };

  /**
   * Sync all defined DAOs to the DB.
   *
   * @param {Object} [options= {}]
   * @param {Boolean} [options.force=false] If force is true, each DAO will do DROP TABLE IF EXISTS ..., before it tries to create its own table
   * @param {Boolean|function} [options.logging=console.log] A function that logs sql queries, or false for no logging
   * @param {String} [options.schema='public'] The schema that the tables should be created in. This can be overriden for each table in sequelize.define
   * @return {Promise}
   */
  Sequelize.prototype.sync = function(options) {
    var self = this;

    options = Utils._.defaults(options || {}, this.options.sync, this.options);
    options.logging = options.logging === undefined ? false : options.logging;

    var when;
    if (options.force) {
      when = this.drop(options);
    } else {
      when = Promise.resolve();
    }

    return when.then(function() {
      var daos = [];

      // Topologically sort by foreign key constraints to give us an appropriate
      // creation order
      self.modelManager.forEachDAO(function(dao) {
        if (dao) {
          daos.push(dao);
        } else {
          // DB should throw an SQL error if referencing inexistant table
        }
      });

      return Promise.reduce(daos, function(total, dao) {
        return dao.sync(options);
      }, null);
    });
  };

  /**
   * Drop all tables defined through this sequelize instance. This is done by calling Model.drop on each model
   * @see {Model#drop} for options
   *
   * @param {object} options  The options passed to each call to Model.drop
   * @return {Promise}
   */
  Sequelize.prototype.drop = function(options) {
    var daos = [];

    this.modelManager.forEachDAO(function(dao) {
      if (dao) {
        daos.push(dao);
      }
    }, { reverse: false});

    return Promise.reduce(daos, function(total, dao) {
      return dao.drop(options);
    }, null);
  };

  /**
   * Test the connection by trying to authenticate
   *
   * @fires success If authentication was successfull
   * @error 'Invalid credentials' if the authentication failed (even if the database did not respond at all...)
   * @alias validate
   * @return {Promise}
   */
  Sequelize.prototype.authenticate = function() {
    return this.query('SELECT 1+1 AS result', null, { raw: true, plain: true }).return().catch(function(err) {
      throw new Error(err);
    });
  };

  Sequelize.prototype.validate = Sequelize.prototype.authenticate;

  /**
   * Creates a object representing a database function. This can be used in search queries, both in where and order parts, and as default values in column definitions.
   * If you want to refer to columns in your function, you should use `sequelize.col`, so that the columns are properly interpreted as columns and not a strings.
   *
   * Convert a user's username to upper case
   * ```js
   * instance.updateAttributes({
   *   username: self.sequelize.fn('upper', self.sequelize.col('username'))
   * })
   * ```
   *
   * @see {Model#find}
   * @see {Model#findAll}
   * @see {Model#define}
   * @see {Sequelize#col}
   * @method fn
   *
   * @param {String} fn The function you want to call
   * @param {any} args All further arguments will be passed as arguments to the function
   *
   * @since v2.0.0-dev3
   * @return {Sequelize.fn}
   */
  Sequelize.fn = Sequelize.prototype.fn = function(fn) {
    return new Utils.fn(fn, Array.prototype.slice.call(arguments, 1));
  };

  /**
   * Creates a object representing a column in the DB. This is often useful in conjunction with `sequelize.fn`, since raw string arguments to fn will be escaped.
   * @see {Sequelize#fn}
   *
   * @method col
   * @param {String} col The name of the column
   * @since v2.0.0-dev3
   * @return {Sequelize.col}
   */
  Sequelize.col = Sequelize.prototype.col = function(col) {
    return new Utils.col(col);
  };


  /**
   * Creates a object representing a call to the cast function.
   *
   * @method cast
   * @param {any} val The value to cast
   * @param {String} type The type to cast it to
   * @since v2.0.0-dev3
   * @return {Sequelize.cast}
   */
  Sequelize.cast = Sequelize.prototype.cast = function(val, type) {
    return new Utils.cast(val, type);
  };

  /**
   * Creates a object representing a literal, i.e. something that will not be escaped.
   *
   * @method literal
   * @param {any} val
   * @alias asIs
   * @since v2.0.0-dev3
   * @return {Sequelize.literal}
   */
  Sequelize.literal = Sequelize.prototype.literal = function(val) {
    return new Utils.literal(val);
  };

  Sequelize.asIs = Sequelize.prototype.asIs = function(val) {
    return new Utils.asIs(val);
  };

  /**
   * An AND query
   * @see {Model#find}
   *
   * @method and
   * @param {String|Object} args Each argument will be joined by AND
   * @since v2.0.0-dev3
   * @return {Sequelize.and}
   */
  Sequelize.and = Sequelize.prototype.and = function() {
    return new Utils.and(Array.prototype.slice.call(arguments));
  };

  /**
   * An OR query
   * @see {Model#find}
   *
   * @method or
   * @param {String|Object} args Each argument will be joined by OR
   * @since v2.0.0-dev3
   * @return {Sequelize.or}
   */
  Sequelize.or = Sequelize.prototype.or = function() {
    return new Utils.or(Array.prototype.slice.call(arguments));
  };

  /*
   * A way of specifying attr = condition. Mostly used internally
   * @see {Model#find}
   *
   * @param {string} attr The attribute
   * @param {String|Object} condition The condition. Can be both a simply type, or a further condition (`.or`, `.and`, `.literal` etc.)
   * @method where
   * @alias condition
   * @since v2.0.0-dev3
   * @return {Sequelize.where}
   */
  Sequelize.where = Sequelize.prototype.where = function() {
    return new Utils.where(Array.prototype.slice.call(arguments));
  };

  Sequelize.condition = Sequelize.prototype.condition = function() {
    return new Utils.condition(Array.prototype.slice.call(arguments));
  };

  /**
   * Start a transaction. When using transactions, you should pass the transaction in the options argument in order for the query to happen under that transaction
   *
   * ```js
   * sequelize.transaction().then(function (t) {
   *   return User.find(..., { transaction: t}).then(function (user) {
   *     return user.updateAttributes(..., { transaction: t});
   *   })
   *   .then(t.commit.bind(t))
   *   .catch(t.rollback.bind(t));
   * })
   * ```
   *
   * @see {Transaction}

   * @param {Object} [options= {}]
   * @param {Boolean} [options.autocommit=true]
   * @param {String} [options.isolationLevel='REPEATABLE READ'] See `Sequelize.Transaction.ISOLATION_LEVELS` for possible options
   * @param {Function} callback Called when the transaction has been set up and is ready for use. If the callback takes two arguments it will be called with err, transaction, otherwise it will be called with transaction.
   * @return {Transaction}
   * @fires error If there is an uncaught error during the transaction
   * @fires success When the transaction has ended (either comitted or rolled back)
   */
  Sequelize.prototype.transaction = function(_options, _callback) {
    var options = (typeof _options === 'function') ? {} : _options
      , callback = (typeof _options === 'function') ? _options : _callback
      , wantsError = callback && callback.length === 2
      , transaction = new Transaction(this, options);
   
    return transaction.prepareEnvironment().then(function () {
      wantsError ? callback(null, transaction) : callback && callback(transaction);
      return transaction;
    }).catch(function (err) {
      if (wantsError) callback(err);
      else throw err;
    });
  };

  Sequelize.prototype.log = function() {
    var args = [].slice.call(arguments);

    if (this.options.logging) {
      if (this.options.logging === true) {
        console.log('DEPRECATION WARNING: The logging-option should be either a function or false. Default: console.log');
        this.options.logging = console.log;
      }

      this.options.logging.apply(null, args);
    }
  };

  return Sequelize;
})();
