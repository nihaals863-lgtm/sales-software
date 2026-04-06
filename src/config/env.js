const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

function getJwtSecret() {
    const s = process.env.JWT_SECRET;
    if (s != null && String(s).trim() !== '') {
        return String(s).trim();
    }
    if (process.env.NODE_ENV !== 'production') {
        return 'sales-backend-dev-jwt-secret-not-for-production';
    }
    return null;
}

module.exports = { getJwtSecret };
