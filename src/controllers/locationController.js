const prisma = require('../config/db');

// @route   GET /api/v1/locations
const getLocations = async (req, res) => {
    try {
        const locations = await prisma.location.findMany();
        
        // Enhance with stats (mocked counts for now or can join)
        const enhanced = await Promise.all(locations.map(async (loc) => {
            try {
                const professionals = await prisma.user.count({
                    where: { 
                        role: 'WORKER', 
                        city: { contains: loc.city } 
                    }
                });
                const activeLeads = await prisma.lead.count({
                    where: { 
                        location: { contains: loc.city }, 
                        status: 'OPEN' 
                    }
                });

                return {
                    ...loc,
                    professionals,
                    activeLeads
                };
            } catch (e) {
                console.error(`Stats for ${loc.city} failed:`, e);
                return { ...loc, professionals: 0, activeLeads: 0 };
            }
        }));

        res.status(200).json({ success: true, data: enhanced });
    } catch (err) {
        console.error("GET Locations Error:", err);
        res.status(500).json({ success: false, message: 'Fetch locations failed: ' + err.message });
    }
};

// @route   POST /api/v1/locations
const createLocation = async (req, res) => {
    try {
        const { name, city, state, country } = req.body;
        
        if (!city || !name) {
            return res.status(400).json({ success: false, message: 'Name and City are required' });
        }

        const loc = await prisma.location.create({
            data: { 
                name, 
                city, 
                state: state || '', 
                country: country || 'USA' 
            }
        });
        res.status(201).json({ success: true, data: loc });
    } catch (err) {
        console.error("POST Location Error:", err);
        res.status(500).json({ success: false, message: 'Creation failed: ' + err.message });
    }
};

// @route   DELETE /api/v1/locations/:id
const deleteLocation = async (req, res) => {
    try {
        const { id } = req.params;
        await prisma.location.delete({ where: { id } });
        res.status(200).json({ success: true, message: 'Location removed' });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Deletion failed' });
    }
};

module.exports = { getLocations, createLocation, deleteLocation };
