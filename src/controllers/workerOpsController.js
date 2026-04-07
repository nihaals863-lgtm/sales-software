const prisma = require('../config/db');

/** Invoices for jobs assigned to this worker (payout / tax reference). */
const getWorkerPayoutsSnapshot = async (req, res) => {
    try {
        const workerId = req.user.id;
        const me = await prisma.user.findUnique({
            where: { id: workerId },
            select: {
                name: true,
                email: true,
                adminCommission: true,
                workerCommission: true,
                isAvailable: true,
            },
        });

        const invoices = await prisma.jobInvoice.findMany({
            where: { job: { workerId } },
            orderBy: { createdAt: 'desc' },
            take: 80,
            include: {
                job: {
                    select: {
                        id: true,
                        jobNo: true,
                        guestName: true,
                        customer: { select: { name: true } },
                    },
                },
            },
        });

        const payments = invoices.map((i) => ({
            id: i.id,
            jobNo: i.job?.jobNo || '—',
            jobId: i.job?.id,
            dateLabel: i.createdAt ? i.createdAt.toLocaleDateString() : '',
            amount: Number(i.amount) || 0,
            status: i.status,
            customerLabel: i.job?.customer?.name || i.job?.guestName || 'Customer',
        }));

        const paidSum = payments.filter((p) => p.status === 'PAID').reduce((s, p) => s + p.amount, 0);
        const unpaidSum = payments.filter((p) => p.status === 'UNPAID').reduce((s, p) => s + p.amount, 0);

        res.status(200).json({
            success: true,
            data: {
                profile: {
                    name: me?.name,
                    email: me?.email,
                    splitNote:
                        me?.adminCommission != null && me?.workerCommission != null
                            ? `Recorded split: Admin ${me.adminCommission}% / You ${me.workerCommission}%`
                            : 'Commission split not set on profile yet.',
                    status: me?.isAvailable ? 'Active' : 'Inactive',
                },
                payments,
                totals: { paid: paidSum, pending: unpaidSum },
                documentsNote:
                    'W-2 / 1099 PDFs are not stored in the app. Use totals below with your accountant.',
            },
        });
    } catch (err) {
        console.error('getWorkerPayoutsSnapshot:', err);
        res.status(500).json({ success: false, message: 'Failed to load payouts' });
    }
};

/** Materials lines from estimates on this worker's jobs only. */
const getWorkerMaterialsSnapshot = async (req, res) => {
    try {
        const workerId = req.user.id;
        const estimates = await prisma.jobEstimate.findMany({
            where: { job: { workerId } },
            take: 120,
            orderBy: { updatedAt: 'desc' },
            include: {
                job: { select: { jobNo: true, categoryName: true } },
            },
        });

        const map = new Map();
        for (const e of estimates) {
            let m = e.materials;
            if (m == null) continue;
            if (typeof m === 'string') {
                try {
                    m = JSON.parse(m);
                } catch {
                    continue;
                }
            }
            if (typeof m !== 'object') continue;
            const items = Array.isArray(m.lineItems) ? m.lineItems : [];
            const cat = e.job?.categoryName || 'General';
            for (const li of items) {
                const name = (li.name || 'Line item').trim();
                const qty = Number(li.qty) || 0;
                if (!name || qty <= 0) continue;
                const prev = map.get(name) || { name, totalQty: 0, jobCount: 0, categories: new Set() };
                prev.totalQty += qty;
                prev.jobCount += 1;
                prev.categories.add(cat);
                map.set(name, prev);
            }
        }

        const items = Array.from(map.values())
            .map((row) => {
                const cats = Array.from(row.categories);
                const status = row.totalQty >= 20 ? 'In Stock' : 'Low Stock';
                return {
                    id: row.name,
                    name: row.name,
                    category: cats[0] || 'Mixed',
                    remaining: `${Math.round(row.totalQty)} units (quoted)`,
                    status,
                    quoteRefs: row.jobCount,
                };
            })
            .sort((a, b) => b.quoteRefs - a.quoteRefs);

        res.status(200).json({
            success: true,
            data: {
                items,
                note: 'Aggregated from your saved quotes only — not warehouse inventory.',
            },
        });
    } catch (err) {
        console.error('getWorkerMaterialsSnapshot:', err);
        res.status(500).json({ success: false, message: 'Failed to load materials' });
    }
};

module.exports = {
    getWorkerPayoutsSnapshot,
    getWorkerMaterialsSnapshot,
};
