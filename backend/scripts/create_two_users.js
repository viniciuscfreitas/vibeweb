const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');
const path = require('path');

const DB_PATH = path.join(__dirname, '..', 'database.db');
const db = new sqlite3.Database(DB_PATH);

async function createUser(email, username, name, password) {
  return new Promise((resolve, reject) => {
    db.get('SELECT id FROM users WHERE email = ? OR username = ?', [email, username], async (err, user) => {
      if (err) return reject(err);
      if (user) {
        console.log(`User ${email} or ${username} already exists, updating password...`);
        const passwordHash = await bcrypt.hash(password, 10);
        db.run('UPDATE users SET password_hash = ? WHERE username = ?', [passwordHash, username], function(err) {
          if (err) return reject(err);
          console.log(`✅ User ${name} password updated!`);
          resolve(true);
        });
        return;
      }
      const passwordHash = await bcrypt.hash(password, 10);
      db.run('INSERT INTO users (email, username, name, password_hash) VALUES (?, ?, ?, ?)',
        [email, username, name, passwordHash],
        function(err) {
          if (err) return reject(err);
          console.log(`✅ User ${name} (${email}) created successfully!`);
          resolve(true);
        }
      );
    });
  });
}

(async () => {
  try {
    await createUser('kaio@example.com', 'kaio', 'Kaio', 'kaio1234');
    await createUser('vinicius@example.com', 'vinicius', 'Vinicius', 'vini1234');
    db.close();
    process.exit(0);
  } catch (err) {
    console.error('Error:', err);
    db.close();
    process.exit(1);
  }
})();
