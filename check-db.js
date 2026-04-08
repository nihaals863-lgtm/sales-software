const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  try {
    const tables = await prisma.$queryRawUnsafe(`SHOW TABLES`);
    console.log('Tables in database:', JSON.stringify(tables, null, 2));
    
    for (const tableObj of tables) {
      const tableName = Object.values(tableObj)[0];
      const columns = await prisma.$queryRawUnsafe(`SHOW COLUMNS FROM \`${tableName}\``);
      console.log(`Columns in ${tableName}:`, JSON.stringify(columns, null, 2));
    }
  } catch (err) {
    console.error('Error:', err);
  } finally {
    await prisma.$disconnect();
  }
}

main();
