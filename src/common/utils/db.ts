import knex from 'knex';
import knexConfig from 'knexfile';
const dbMssql = knex(knexConfig.development);
const dbMdnEmkl = knex(knexConfig.medanEmkl);
const dbMdnTruck = knex(knexConfig.medanTrucking);
const dbjktEmkl = knex(knexConfig.jktEmkl);
const dbjktTrucking = knex(knexConfig.jktTrucking);
const dbsbyEmkl = knex(knexConfig.sbyEmkl);
const dbsbyTrucking = knex(knexConfig.sbyTrucking);
const dbsmgEmkl = knex(knexConfig.smgEmkl);
const dbmksEmkl = knex(knexConfig.mksEmkl);
const dbmksTrucking = knex(knexConfig.mksTrucking);
const dbbtgEmkl = knex(knexConfig.btgEmkl);
const dbMysqlTes = knex(knexConfig.mysqltest);

export {
  dbMssql,
  dbMdnEmkl,
  dbMdnTruck,
  dbjktEmkl,
  dbjktTrucking,
  dbsbyEmkl,
  dbsbyTrucking,
  dbsmgEmkl,
  dbmksEmkl,
  dbmksTrucking,
  dbbtgEmkl,
  dbMysqlTes,
};
