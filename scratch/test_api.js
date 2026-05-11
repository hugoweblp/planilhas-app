const axios = require('axios');
async function test() {
    try {
        // Create a JWT token just for testing
        const jwt = require('jsonwebtoken');
        const token = jwt.sign({ id: 1, usuario: 'admin' }, 'pdde_premium_secret_key_2026_safe', { expiresIn: '1h' });
        
        console.log('Fetching history...');
        const res1 = await axios.get('http://localhost:3000/api/history/escola/04425349000126', {
            headers: { 'Authorization': 'Bearer ' + token }
        });
        console.log('History success:', res1.data.success);
        
        console.log('Fetching stats...');
        const res2 = await axios.get('http://localhost:3000/api/stats/escola/04425349000126', {
            headers: { 'Authorization': 'Bearer ' + token }
        });
        console.log('Stats success:', res2.data.success);
        
    } catch(e) {
        if(e.response) {
            console.error('API Error:', e.response.status, e.response.data);
        } else {
            console.error('Request Error:', e.message);
        }
    }
}
test();
