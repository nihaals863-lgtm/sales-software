const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const plans = [
    { name: 'Starter', price: 29.0, leads: 50, features: JSON.stringify(['Basic Dashboard', 'Email Notifications', 'Standard Support']) },
    { name: 'Professional', price: 99.0, leads: 200, features: JSON.stringify(['Unlimited CRM Access', 'Live Tracking', 'Priority Support', 'Geo-Fencing']) },
    { name: 'Enterprise', price: 299.0, leads: 0, features: JSON.stringify(['Custom Dashboards', 'API Access', 'dedicated Account Manager', 'White-labeling']) }
  ];

  for (const plan of plans) {
    await prisma.subscriptionPlan.upsert({
      where: { name: plan.name },
      update: plan,
      create: plan
    });
  }
  console.log('Subscription plans seeded successfully!');
}

main()
  .catch(e => console.error(e))
  .finally(async () => await prisma.$disconnect());
