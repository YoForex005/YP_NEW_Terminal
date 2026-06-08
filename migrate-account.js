const { Client } = require('pg');

const client = new Client({
  connectionString: 'postgresql://crm:crm@127.0.0.1:5432/forex_crm'
});

async function main() {
  try {
    await client.connect();
    
    // Get the admin user id
    const userRes = await client.query("SELECT id FROM app_users WHERE email = 'fxtrusts.demo+20260421140451@gmail.com'");
    if (userRes.rows.length === 0) {
      console.log('User not found!');
      return;
    }
    const userId = userRes.rows[0].id;
    
    // Check if account already exists
    const checkAcc = await client.query("SELECT * FROM accounts WHERE login = 303100");
    if (checkAcc.rows.length > 0) {
      console.log('Account 303100 already exists. Updating owner_id...');
      await client.query("UPDATE accounts SET owner_id = $1 WHERE login = 303100", [userId]);
      console.log('Account 303100 successfully migrated to your user!');
    } else {
      console.log('Account 303100 not found in DB. Inserting mock account...');
      const credentials = {
        login: "303100",
        server: "57.128.141.65",
        tradingPassword: "password123", // mock password
        investorPassword: "investor123",
        source: "migration"
      };
      await client.query(`
        INSERT INTO accounts (
          login, owner_id, platform, mode, status, currency, name, server, server_host, credentials_json, leverage, balance
        ) VALUES (
          303100, $1, 'mt5', 'live', 'Active', 'USD', 'Migrated MT5 303100', '57.128.141.65', '57.128.141.65', $2, 100, 10000
        )
      `, [userId, JSON.stringify(credentials)]);
      console.log('Mock account 303100 successfully created and attached to your user!');
    }

  } catch (err) {
    console.error('Error migrating account:', err);
  } finally {
    await client.end();
  }
}

main();
