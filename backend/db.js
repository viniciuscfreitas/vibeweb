// Database Initialization - VibeWeb OS
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const DB_PATH = path.join(__dirname, 'database.db');

function initDatabase(uptimeMonitorCallback) {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(DB_PATH, (err) => {
      if (err) {
        console.error('Error opening database:', err);
        return reject(err);
      }
      console.log('Connected to SQLite database');

      db.run('PRAGMA foreign_keys = ON;', (err) => {
        if (err) {
          console.error('Error enabling foreign keys:', err);
          return reject(err);
        }

        db.serialize(() => {
          createUsersTable(db);
          createTasksTable(db);
          createActivityLogTable(db);
          createSubtasksTable(db, () => {
            console.log('Database initialized successfully');
            if (uptimeMonitorCallback) {
              uptimeMonitorCallback(db);
            }
            resolve(db);
          });
        });
      });
    });
  });
}

function createUsersTable(db) {
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      username TEXT UNIQUE,
      name TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      avatar_url TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `, (err) => {
    if (err) console.error('Error creating users table:', err);

    db.all(`PRAGMA table_info(users)`, (err, columns) => {
      if (err) return;
      const columnNames = columns.map(col => col.name);
      
      if (!columnNames.includes('username')) {
        db.run(`ALTER TABLE users ADD COLUMN username TEXT`, (err) => {
          if (!err) {
            db.run(`CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username ON users(username) WHERE username IS NOT NULL`);
          }
        });
      } else {
        db.run(`CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username ON users(username) WHERE username IS NOT NULL`);
      }

      if (!columnNames.includes('avatar_url')) {
        db.run(`ALTER TABLE users ADD COLUMN avatar_url TEXT`);
      }
    });
  });

  db.run(`CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)`);
}

function createTasksTable(db) {
  db.run(`
    CREATE TABLE IF NOT EXISTS tasks (
      id INTEGER PRIMARY KEY,
      user_id INTEGER NOT NULL,
      client TEXT NOT NULL,
      contact TEXT,
      type TEXT,
      stack TEXT,
      domain TEXT,
      description TEXT,
      price REAL NOT NULL,
      payment_status TEXT,
      deadline TEXT,
      deadline_timestamp INTEGER,
      hosting TEXT,
      col_id INTEGER NOT NULL,
      order_position INTEGER NOT NULL,
      is_recurring INTEGER DEFAULT 0,
      assets_link TEXT,
      uptime_status TEXT,
      public_uuid TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `, (err) => {
    if (err) console.error('Error creating tasks table:', err);

    db.all(`PRAGMA table_info(tasks)`, (err, columns) => {
      if (err) return;
      const columnNames = columns.map(col => col.name);
      
      const migrations = [
        { name: 'is_recurring', def: 'INTEGER DEFAULT 0' },
        { name: 'assets_link', def: 'TEXT' },
        { name: 'uptime_status', def: 'TEXT' },
        { name: 'public_uuid', def: 'TEXT' }
      ];

      migrations.forEach(m => {
        if (!columnNames.includes(m.name)) {
          db.run(`ALTER TABLE tasks ADD COLUMN ${m.name} ${m.def}`, (err) => {
            if (!err && m.name === 'public_uuid') {
              db.run(`CREATE UNIQUE INDEX IF NOT EXISTS idx_tasks_public_uuid ON tasks(public_uuid) WHERE public_uuid IS NOT NULL`);
            }
          });
        } else if (m.name === 'public_uuid') {
          db.run(`CREATE UNIQUE INDEX IF NOT EXISTS idx_tasks_public_uuid ON tasks(public_uuid) WHERE public_uuid IS NOT NULL`);
        }
      });
    });
  });

  db.run(`CREATE INDEX IF NOT EXISTS idx_tasks_user_id ON tasks(user_id)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_tasks_user_col_order ON tasks(user_id, col_id, order_position)`);
}

function createActivityLogTable(db) {
  db.run(`
    CREATE TABLE IF NOT EXISTS activity_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      task_id INTEGER,
      action_type TEXT NOT NULL,
      action_description TEXT,
      old_data TEXT,
      new_data TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE SET NULL
    )
  `);

  db.run(`CREATE INDEX IF NOT EXISTS idx_activity_log_user_id ON activity_log(user_id)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_activity_log_task_id ON activity_log(task_id)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_activity_log_created_at ON activity_log(created_at DESC)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_activity_log_task_created ON activity_log(task_id, created_at DESC)`);
}

function createSubtasksTable(db, callback) {
  db.run(`
    CREATE TABLE IF NOT EXISTS subtasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      completed INTEGER DEFAULT 0,
      order_position INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
    )
  `, (err) => {
    if (err) console.error('Error creating subtasks table:', err);
    db.run(`CREATE INDEX IF NOT EXISTS idx_subtasks_task_id ON subtasks(task_id)`, callback);
  });
}

module.exports = { initDatabase };
