// Seed script - Criar usuário padrão
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');
const path = require('path');

const DB_PATH = path.join(__dirname, '..', 'database.db');

const db = new sqlite3.Database(DB_PATH, (err) => {
  if (err) {
    console.error('Error opening database:', err);
    process.exit(1);
  }

  console.log('Connected to database for seeding');

  // Create default user
  const email = 'vinicius@example.com';
  const password = 'admin123';
  const name = 'Vinícius Freitas';

  // Check if user already exists
  db.get('SELECT id FROM users WHERE email = ?', [email], async (err, user) => {
    if (err) {
      console.error('Error checking user:', err);
      db.close();
      process.exit(1);
    }

    if (user) {
      console.log('User already exists. Skipping seed.');
      db.close();
      process.exit(0);
    }

    // Hash password
    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(password, saltRounds);

    // Insert user
    db.run(
      'INSERT INTO users (email, name, password_hash) VALUES (?, ?, ?)',
      [email, name, passwordHash],
      function (err) {
        if (err) {
          console.error('Error creating user:', err);
          db.close();
          process.exit(1);
        }

        console.log('✅ Default user created successfully!');
        console.log(`   Email: ${email}`);
        console.log(`   Password: ${password}`);
        db.close();
        process.exit(0);
      }
    );
  });
});
