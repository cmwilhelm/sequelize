'use strict';

var _ = require('lodash')
  , Abstract = require('../abstract')
  , ConnectionManager = require('./connection-manager')
  , Query = require('./query');

var PostgresDialect = function(sequelize) {
  this.sequelize = sequelize;
  this.connectionManager = new ConnectionManager(this, sequelize);
};

PostgresDialect.prototype.supports = _.defaults({
  'RETURNING': true,
  'DEFAULT VALUES': true,
  schemas: true,
  lock: true,
  forShare: 'FOR SHARE'
}, Abstract.prototype.supports);

PostgresDialect.prototype.Query = Query;

module.exports = PostgresDialect;