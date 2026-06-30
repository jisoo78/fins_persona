import dotenv from 'dotenv';
import mysql from 'mysql2/promise';

dotenv.config({ path: '.env.local' });
dotenv.config();

export const db = mysql.createPool({
  host: process.env.MYSQL_HOST ?? '127.0.0.1',
  port: Number(process.env.MYSQL_PORT ?? 3306),
  user: process.env.MYSQL_USER ?? 'root',
  password: process.env.MYSQL_PASSWORD ?? '',
  database: process.env.MYSQL_DATABASE ?? 'decision',
  connectionLimit: 10,
  namedPlaceholders: true,
});

export const toJson = (value: unknown) => JSON.stringify(value ?? null);
