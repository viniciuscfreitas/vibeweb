const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const DB_PATH = path.join(__dirname, '..', 'database.db');

const db = new sqlite3.Database(DB_PATH, (err) => {
  if (err) {
    console.error('Error opening database:', err);
    process.exit(1);
  }

  console.log('Connected to database for production reset');

  db.serialize(() => {
    db.run('PRAGMA foreign_keys = OFF;');

    const tablesToClear = ['tasks', 'activity_log', 'subtasks'];
    
    tablesToClear.forEach(table => {
      db.run(`DELETE FROM ${table};`, (err) => {
        if (err) {
          if (err.message.includes('no such table')) {
            console.log(`ℹ️ Table ${table} does not exist, skipping.`);
          } else {
            console.error(`❌ Error clearing ${table}:`, err.message);
          }
        } else {
          console.log(`✅ Table ${table} cleared`);
        }
      });
    });

    db.run('PRAGMA foreign_keys = ON;');

    db.run('VACUUM;', (err) => {
      if (err) console.error('❌ Error vacuuming database:', err.message);
      else console.log('✅ Database vacuumed');
      
      db.close((err) => {
        if (err) {
          console.error('❌ Error closing database:', err.message);
          process.exit(1);
        }
        console.log('Database reset complete. Users preserved.');
        process.exit(0);
      });
    });
  });
});
