const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function check() {
  const users = await prisma.user.findMany({
    select: { email: true, role: true }
  });
  console.log('=== USERS IN DB ===');
  users.forEach(u => console.log(`'${u.email}' [${u.role}]`));
  
  const requests = await prisma.professionalRequest.findMany({
    select: { email: true, status: true }
  });
  console.log('\n=== REQUESTS IN DB ===');
  requests.forEach(r => console.log(`'${r.email}' [${r.status}]`));
  
  process.exit();
}

check();
