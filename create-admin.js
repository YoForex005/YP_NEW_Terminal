const { Client } = require('pg');
const crypto = require('crypto');

const client = new Client({
  connectionString: 'postgresql://crm:crm@127.0.0.1:5432/forex_crm'
});

async function main() {
  try {
    await client.connect();
    const id = crypto.randomUUID();
    const email = 'fxtrusts.demo+20260421140451@gmail.com';
    
    // Check if user already exists
    const checkRes = await client.query('SELECT * FROM app_users WHERE email = $1', [email]);
    if (checkRes.rows.length > 0) {
      console.log('User already exists.');
    } else {
      await client.query(
        "INSERT INTO app_users (id, email, name, role, password_hash) VALUES ($1, $2, $3, 'admin', '')",
        [id, email, 'Admin User']
      );
      console.log('Admin user created successfully!');
    }
  } catch (err) {
    console.error('Error creating user:', err);
  } finally {
    await client.end();
  }
}

main();
