const { PrismaClient } = require('@prisma/client');
require('dotenv').config();

const prisma = new PrismaClient({
  log: ['query', 'info', 'warn', 'error'],
});

async function main() {
  console.log('Testing connection with DATABASE_URL:', process.env.DATABASE_URL);
  try {
    await prisma.$connect();
    console.log('Successfully connected to the database!');
    const tables = await prisma.$queryRaw`SHOW TABLES`;
    console.log('Tables in database:', tables);
  } catch (error) {
    console.error('Failed to connect to the database:');
    console.error('Error Code:', error.code);
    console.error('Error Message:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

main();
