const prisma = require('../config/db');

// @route   GET /api/v1/reviews
// @desc    Get all reviews for the professional/worker
const getReviews = async (req, res) => {
    try {
        const reviews = await prisma.review.findMany({
            where: {
                job: {
                    workerId: req.user.id
                }
            },
            include: {
                job: {
                    include: {
                        customer: {
                            select: {
                                name: true
                            }
                        }
                    }
                }
            },
            orderBy: {
                createdAt: 'desc'
            }
        });

        // Map for easier UI consumption
        const formatted = reviews.map(rev => ({
            id: rev.id,
            author: rev.job.customer.name,
            role: 'Customer',
            rating: rev.rating,
            comment: rev.comment,
            date: rev.createdAt.toLocaleDateString(),
            verified: true,
            jobNo: rev.job.jobNo
        }));

        // Group ratings for distribution data
        const distribution = [5, 4, 3, 2, 1].map(stars => {
            const count = formatted.filter(r => r.rating === stars).length;
            const percentage = formatted.length > 0 ? (count / formatted.length) * 100 : 0;
            return { stars, percentage };
        });

        const totalRating = formatted.reduce((acc, curr) => acc + curr.rating, 0);
        const averageRating = formatted.length > 0 ? (totalRating / formatted.length).toFixed(1) : '0.0';

        res.status(200).json({ 
            success: true, 
            count: formatted.length, 
            data: formatted,
            averageRating: parseFloat(averageRating),
            distribution
        });
    } catch (error) {
        console.error("Fetch Reviews Error:", error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

module.exports = {
    getReviews
};
