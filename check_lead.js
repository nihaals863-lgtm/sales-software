const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const leadId = 'ca840e3a-c168-46ec-ad01-b7fb77d90bcb';
  const lead = await prisma.lead.findUnique({
    where: { id: leadId }
  });
  if (lead) {
    console.log('Lead Found:', lead.id);
    console.log('Status:', lead.status);
    console.log('Is Available (status === "OPEN"):', lead.status === 'OPEN');
  } else {
    console.log('Lead NOT found in database.');
  }
}

main()
  .catch(e => console.error(e))
  .finally(async () => await prisma.$disconnect());
