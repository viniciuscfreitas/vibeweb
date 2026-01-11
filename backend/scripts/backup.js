const fs = require('fs');
const path = require('path');

function backupDatabase() {
  const dbPath = path.join(__dirname, '../database.db');
  const backupDir = path.join(__dirname, '../backups');

  if (!fs.existsSync(dbPath)) {
    console.error('[Backup] Database file not found at:', dbPath);
    return;
  }

  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = path.join(backupDir, `backup-${timestamp}.db`);

  try {
    fs.copyFileSync(dbPath, backupPath);
    console.log('[Backup] Successfully created backup:', backupPath);

    // Clean up old backups (keep only last 7)
    const files = fs.readdirSync(backupDir)
      .filter(f => f.startsWith('backup-') && f.endsWith('.db'))
      .map(f => ({ name: f, time: fs.statSync(path.join(backupDir, f)).mtime.getTime() }))
      .sort((a, b) => b.time - a.time);

    if (files.length > 7) {
      files.slice(7).forEach(f => {
        fs.unlinkSync(path.join(backupDir, f.name));
        console.log('[Backup] Deleted old backup:', f.name);
      });
    }
  } catch (err) {
    console.error('[Backup] Error creating backup:', err);
  }
}

if (require.main === module) {
  backupDatabase();
}

module.exports = backupDatabase;
