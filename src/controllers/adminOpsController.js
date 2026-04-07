const prisma = require('../config/db');

function initials(name) {
    if (!name || typeof name !== 'string') return '?';
    const p = name.trim().split(/\s+/).filter(Boolean);
    if (p.length >= 2) return (p[0][0] + p[1][0]).toUpperCase();
    return name.slice(0, 2).toUpperCase();
}

/** Workers + invoice-based payout lines (no W-2/1099 PDFs until you add storage). */
const getAdminTaxPayroll = async (req, res) => {
    try {
        const workers = await prisma.user.findMany({
            where: { role: 'WORKER' },
            select: {
                id: true,
                name: true,
                email: true,
                isAvailable: true,
                adminCommission: true,
                workerCommission: true,
                updatedAt: true,
            },
            orderBy: { name: 'asc' },
        });

        const workerRows = workers.map((w) => ({
            id: w.id,
            name: w.name,
            email: w.email || '',
            initials: initials(w.name),
            role: 'Professional',
            classification: 'Payout split',
            splitNote:
                w.adminCommission != null && w.workerCommission != null
                    ? `Admin ${w.adminCommission}% / Worker ${w.workerCommission}%`
                    : 'Default commission',
            status: w.isAvailable ? 'Active' : 'Inactive',
            lastActive: w.updatedAt ? w.updatedAt.toLocaleString() : '',
        }));

        const invoices = await prisma.jobInvoice.findMany({
            take: 60,
            orderBy: { createdAt: 'desc' },
            include: {
                job: {
                    select: {
                        id: true,
                        jobNo: true,
                        guestName: true,
                        worker: { select: { name: true } },
                        customer: { select: { name: true } },
                    },
                },
            },
        });

        const payments = invoices.map((i) => ({
            id: i.id,
            workerName: i.job?.worker?.name || 'Unassigned',
            jobNo: i.job?.jobNo || '—',
            jobId: i.job?.id,
            date: i.createdAt,
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
                workers: workerRows,
                documents: [],
                documentsNote: 'Tax forms (W-2 / 1099 PDFs) are not stored yet. Export payroll from your accounting tool using invoice data below.',
                payments,
                totals: { paid: paidSum, pending: unpaidSum, overdue: 0 },
            },
        });
    } catch (err) {
        console.error('getAdminTaxPayroll:', err);
        res.status(500).json({ success: false, message: 'Failed to load tax & payroll snapshot' });
    }
};

/** Roll up line items from saved job estimates (materials JSON). */
const getAdminInventorySnapshot = async (req, res) => {
    try {
        const estimates = await prisma.jobEstimate.findMany({
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
                const status =
                    row.totalQty >= 20 ? 'In Stock' : row.totalQty >= 5 ? 'Low Stock' : 'Low Stock';
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
                note: 'Quantities are summed from saved quotes (estimates), not warehouse stock.',
            },
        });
    } catch (err) {
        console.error('getAdminInventorySnapshot:', err);
        res.status(500).json({ success: false, message: 'Failed to load inventory snapshot' });
    }
};

/** Lead / assignment notifications as marketing & follow-up activity. */
const getAdminMarketingFeed = async (req, res) => {
    try {
        const [notifs, upgrades] = await Promise.all([
            prisma.notification.findMany({
                orderBy: { createdAt: 'desc' },
                take: 40,
            }),
            prisma.subscriptionUpgradeRequest.findMany({
                where: { status: 'PENDING' },
                include: { user: { select: { name: true, email: true } }, plan: true },
                orderBy: { createdAt: 'desc' },
                take: 15,
            }),
        ]);

        const activities = [
            ...notifs.map((n) => ({
                id: n.id,
                kind: 'notification',
                title: n.title,
                message: n.message,
                date: n.createdAt,
                dateLabel: n.createdAt.toLocaleString(),
            })),
            ...upgrades.map((u) => ({
                id: `up-${u.id}`,
                kind: 'upgrade',
                title: `Plan upgrade: ${u.user?.name || 'User'}`,
                message: `Requested ${u.plan?.name || 'plan'} — ${u.status}`,
                date: u.createdAt,
                dateLabel: u.createdAt.toLocaleString(),
            })),
        ].sort((a, b) => new Date(b.date) - new Date(a.date));

        res.status(200).json({
            success: true,
            data: {
                activities: activities.slice(0, 35),
                note: 'Email open/click rates require a mail provider integration. Below is real in-app activity from your database.',
            },
        });
    } catch (err) {
        console.error('getAdminMarketingFeed:', err);
        res.status(500).json({ success: false, message: 'Failed to load marketing activity' });
    }
};

module.exports = {
    getAdminTaxPayroll,
    getAdminInventorySnapshot,
    getAdminMarketingFeed,
};
