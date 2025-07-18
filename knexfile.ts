import { Knex } from 'knex';
import * as dotenv from 'dotenv';
import * as path from 'path';
dotenv.config();

const knexConfig: { [key: string]: Knex.Config } = {
  development: {
    client: 'mssql',
    connection: {
      server: process.env.SSMS_SERVER,
      user: process.env.SSMS_USER,
      password: process.env.SSMS_PASSWORD,
      database: process.env.SSMS_DB,
      port: Number(process.env.SSMS_PORT),
      options: {
        encrypt: false,
        enableArithAbort: true, // Diperlukan untuk mencegah error aritmatika
      },
      pool: {
        max: 10, // Sesuaikan jumlah koneksi maksimal pool
        min: 0,
        idleTimeoutMillis: 30000, // Timeout saat koneksi idle
      },
      requestTimeout: 30000, // Mengatur timeout permintaan ke 30 detik
    },
    migrations: {
      tableName: 'knex_migrations',
      // Set an absolute path to the migrations folder
      directory: './migrations',
    },
  },
  medanEmkl: {
    client: 'mssql',
    connection: {
      server: process.env.SSMS_SERVER_EMKL_MEDAN,
      user: process.env.SSMS_USER_EMKL_MEDAN,
      password: process.env.SSMS_PASSWORD_EMKL_MEDAN,
      database: process.env.SSMS_DB_EMKL_MEDAN,
      port: Number(process.env.SSMS_PORT_EMKL_MEDAN),
      options: {
        encrypt: false,
        enableArithAbort: true, // Diperlukan untuk mencegah error aritmatika
      },
      requestTimeout: 50000000, // Mengatur timeout permintaan ke 30 detik
    },
    migrations: {
      tableName: 'knex_migrations',
      // Set an absolute path to the migrations folder
      directory: './migrations',
    },
  },
  medanTrucking: {
    client: 'mssql',
    connection: {
      server: process.env.SSMS_SERVER_MEDAN_TRUCKING,
      user: process.env.SSMS_USER_MEDAN_TRUCKING,
      password: process.env.SSMS_PASSWORD_MEDAN_TRUCKING,
      database: process.env.SSMS_DB_MEDAN_TRUCKING,
      port: Number(process.env.SSMS_PORT_MEDAN_TRUCKING),
      options: {
        encrypt: false,
        enableArithAbort: true, // Diperlukan untuk mencegah error aritmatika
      },
      requestTimeout: 50000000, // Mengatur timeout permintaan ke 30 detik
    },
    migrations: {
      tableName: 'knex_migrations',
      // Set an absolute path to the migrations folder
      directory: './migrations',
    },
  },
  jktEmkl: {
    client: 'mssql',
    connection: {
      server: process.env.SSMS_SERVER_JKT_EMKL,
      user: process.env.SSMS_USER_JKT_EMKL,
      password: process.env.SSMS_PASSWORD_JKT_EMKL,
      database: process.env.SSMS_DB_JKT_EMKL,
      port: Number(process.env.SSMS_PORT_JKT_EMKL),
      options: {
        encrypt: false,
        enableArithAbort: true, // Diperlukan untuk mencegah error aritmatika
      },
      requestTimeout: 50000000, // Mengatur timeout permintaan ke 30 detik
    },
    migrations: {
      tableName: 'knex_migrations',
      // Set an absolute path to the migrations folder
      directory: './migrations',
    },
  },
  jktTrucking: {
    client: 'mssql',
    connection: {
      server: process.env.SSMS_SERVER_JKT_TRUCKING,
      user: process.env.SSMS_USER_JKT_TRUCKING,
      password: process.env.SSMS_PASSWORD_JKT_TRUCKING,
      database: process.env.SSMS_DB_JKT_TRUCKING,
      port: Number(process.env.SSMS_PORT_JKT_TRUCKING),
      options: {
        encrypt: false,
        enableArithAbort: true, // Diperlukan untuk mencegah error aritmatika
      },
      requestTimeout: 50000000, // Mengatur timeout permintaan ke 30 detik
    },
    migrations: {
      tableName: 'knex_migrations',
      // Set an absolute path to the migrations folder
      directory: './migrations',
    },
  },
  sbyEmkl: {
    client: 'mssql',
    connection: {
      server: process.env.SSMS_SERVER_SBY_EMKL,
      user: process.env.SSMS_USER_SBY_EMKL,
      password: process.env.SSMS_PASSWORD_SBY_EMKL,
      database: process.env.SSMS_DB_SBY_EMKL,
      port: Number(process.env.SSMS_PORT_SBY_EMKL),
      options: {
        encrypt: false,
        enableArithAbort: true, // Diperlukan untuk mencegah error aritmatika
      },
      requestTimeout: 50000000, // Mengatur timeout permintaan ke 30 detik
    },
    migrations: {
      tableName: 'knex_migrations',
      // Set an absolute path to the migrations folder
      directory: './migrations',
    },
  },
  sbyTrucking: {
    client: 'mssql',
    connection: {
      server: process.env.SSMS_SERVER_SBY_TRUCKING,
      user: process.env.SSMS_USER_SBY_TRUCKING,
      password: process.env.SSMS_PASSWORD_SBY_TRUCKING,
      database: process.env.SSMS_DB_SBY_TRUCKING,
      port: Number(process.env.SSMS_PORT_SBY_TRUCKING),
      options: {
        encrypt: false,
        enableArithAbort: true, // Diperlukan untuk mencegah error aritmatika
      },
      requestTimeout: 50000000, // Mengatur timeout permintaan ke 30 detik
    },
    migrations: {
      tableName: 'knex_migrations',
      // Set an absolute path to the migrations folder
      directory: './migrations',
    },
  },
  smgEmkl: {
    client: 'mssql',
    connection: {
      server: process.env.SSMS_SERVER_SMG_EMKL,
      user: process.env.SSMS_USER_SMG_EMKL,
      password: process.env.SSMS_PASSWORD_SMG_EMKL,
      database: process.env.SSMS_DB_SMG_EMKL,
      port: Number(process.env.SSMS_PORT_SMG_EMKL),
      options: {
        encrypt: false,
        enableArithAbort: true, // Diperlukan untuk mencegah error aritmatika
      },
      requestTimeout: 50000000, // Mengatur timeout permintaan ke 30 detik
    },
    migrations: {
      tableName: 'knex_migrations',
      // Set an absolute path to the migrations folder
      directory: './migrations',
    },
  },
  mksEmkl: {
    client: 'mssql',
    connection: {
      server: process.env.SSMS_SERVER_MKS_EMKL,
      user: process.env.SSMS_USER_MKS_EMKL,
      password: process.env.SSMS_PASSWORD_MKS_EMKL,
      database: process.env.SSMS_DB_MKS_EMKL,
      port: Number(process.env.SSMS_PORT_MKS_EMKL),
      options: {
        encrypt: false,
        enableArithAbort: true, // Diperlukan untuk mencegah error aritmatika
      },
      requestTimeout: 50000000, // Mengatur timeout permintaan ke 30 detik
    },
    migrations: {
      tableName: 'knex_migrations',
      // Set an absolute path to the migrations folder
      directory: './migrations',
    },
  },
  mksTrucking: {
    client: 'mssql',
    connection: {
      server: process.env.SSMS_SERVER_MKS_TRUCKING,
      user: process.env.SSMS_USER_MKS_TRUCKING,
      password: process.env.SSMS_PASSWORD_MKS_TRUCKING,
      database: process.env.SSMS_DB_MKS_TRUCKING,
      port: Number(process.env.SSMS_PORT_MKS_TRUCKING),
      options: {
        encrypt: false,
        enableArithAbort: true, // Diperlukan untuk mencegah error aritmatika
      },
      requestTimeout: 50000000, // Mengatur timeout permintaan ke 30 detik
    },
    migrations: {
      tableName: 'knex_migrations',
      // Set an absolute path to the migrations folder
      directory: './migrations',
    },
  },
  btgEmkl: {
    client: 'mssql',
    connection: {
      server: process.env.SSMS_SERVER_BTG_EMKL,
      user: process.env.SSMS_USER_BTG_EMKL,
      password: process.env.SSMS_PASSWORD_BTG_EMKL,
      database: process.env.SSMS_DB_BTG_EMKL,
      port: 1452,
      options: {
        encrypt: false, // Sesuaikan dengan pengaturan enkripsi pada MSSQL
        enableArithAbort: true, // Diperlukan untuk mencegah error aritmati
      },
      requestTimeout: 50000000,
    },
    migrations: {
      tableName: 'knex_migrations',
      directory: './migrations',
    },
  },
  mysqltest: {
    client: 'mysql',
    connection: {
      host: '54.151.162.192',
      user: 'user1',
      password: 'RFV$*)123wsx',
      database: 'gymnastic_old',
      port: 3306,
      options: {
        encrypt: false, // Sesuaikan dengan pengaturan enkripsi pada MSSQL
        enableArithAbort: true, // Diperlukan untuk mencegah error aritmati
      },
      requestTimeout: 50000000,
    },
    migrations: {
      tableName: 'knex_migrations',
      directory: './migrations',
    },
  },
  production: {
    client: 'mssql',
    connection: {
      server: process.env.SSMS_SERVER,
      user: process.env.SSMS_USER,
      password: process.env.SSMS_PASSWORD,
      database: process.env.SSMS_DB,
      port: 1433,
      options: {
        encrypt: false,
        enableArithAbort: true,
      },
      debug: true, // Optional: Enable debugging to see the SQL queries
      requestTimeout: 30000, // Set the timeout to 30 seconds (30000 ms)
    },
    migrations: {
      tableName: 'knex_migrations',
      // Set an absolute path to the migrations folder
      directory: path.resolve(__dirname, '../migrations'),
    },
  },
};

export default knexConfig;
