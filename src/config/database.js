require('dotenv').config();

const { Sequelize } = require('sequelize');
const mongoose = require('mongoose');

class Database {
  constructor() {
    this.dbType = process.env.DB_TYPE || 'mysql';
    this.connections = {};
    this._connected = false;
  }

  // ================= MYSQL (TiDB / Local) =================
  async connectMySQL() {
    const host = process.env.MYSQL_HOST;
    const user = process.env.MYSQL_USER;
    const password = process.env.MYSQL_PASSWORD;
    const database = process.env.MYSQL_DATABASE;

    // 🔍 Detect TiDB Cloud
    const isCloudMySQL =
      typeof host === 'string' && host.includes('tidbcloud.com');

    const port = Number(process.env.MYSQL_PORT) || (isCloudMySQL ? 4000 : 3306);

    try {
      console.log(
        `🔍 Connecting to MySQL at ${host}:${port} ${
          isCloudMySQL ? '(TiDB Cloud)' : '(Local)'
        }`
      );

      // 🔍 Debug (remove later if you want)
      console.log({
        host,
        user,
        database,
        port
      });

      const sequelize = new Sequelize(database, user, password, {
        host,
        port,
        dialect: 'mysql',

        logging: false,

        dialectOptions: isCloudMySQL
          ? {
              ssl: {
                require: true,
                rejectUnauthorized: false
              }
            }
          : {},

        pool: {
          max: 10,
          min: 0,
          acquire: 30000,
          idle: 10000
        }
      });

      await sequelize.authenticate();

      console.log(
        isCloudMySQL
          ? '✅ Connected to TiDB Cloud (MySQL)'
          : `✅ Connected to MySQL at ${host}:${port}`
      );

      this.connections.mysql = sequelize;
      return sequelize;

    } catch (error) {
      console.error('❌ MySQL connection failed:', error.message);
      throw error;
    }
  }

  // ================= MONGODB =================
  async connectMongoDB() {
    try {
      if (!process.env.MONGO_URI) {
        console.log('⚠️ MongoDB URI not provided, skipping...');
        return;
      }

      console.log('🔍 Connecting to MongoDB...');

      await mongoose.connect(process.env.MONGO_URI);

      console.log('✅ MongoDB connected');
      this.connections.mongodb = mongoose.connection;

    } catch (error) {
      console.error('❌ MongoDB connection failed:', error.message);
      throw error;
    }
  }

  // ================= CONNECT =================
  async connect() {
    try {
      if (this.dbType === 'mysql' || this.dbType === 'both') {
        await this.connectMySQL();
      }

      if (this.dbType === 'mongodb' || this.dbType === 'both') {
        await this.connectMongoDB();
      }

      this._connected = true;
      console.log('🚀 Database layer ready');

    } catch (error) {
      console.error('❌ Database connection failed:', error.message);
      throw error;
    }
  }

  // ================= GET CONNECTION =================
  getConnection(type = 'mysql') {
    const conn = this.connections[type];

    if (!conn) {
      throw new Error(
        `${type} connection not available. Call connect() first.`
      );
    }

    return conn;
  }

  // ================= STATUS =================
  isReady() {
    return this._connected;
  }

  // ================= DISCONNECT =================
  async disconnect() {
    try {
      if (this.connections.mysql) {
        await this.connections.mysql.close();
      }

      if (this.connections.mongodb) {
        await mongoose.connection.close();
      }

      this._connected = false;
      console.log('✅ Database connections closed');

    } catch (error) {
      console.error('❌ Error disconnecting databases:', error.message);
    }
  }
}

module.exports = new Database();