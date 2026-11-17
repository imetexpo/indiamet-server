/**
 * Migration script: Add CMS tracking columns to visitor_passes table
 * Run once: node scripts/migrate-cms-columns.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const database = require('../src/config/database');

async function migrate() {
  console.log('🔄 Connecting to database...');
  await database.connect();

  const sequelize = database.getConnection('mysql');

  const alterStatements = [
    `ALTER TABLE visitor_passes ADD COLUMN IF NOT EXISTS cmsLeadId VARCHAR(64) NULL`,
    `ALTER TABLE visitor_passes ADD COLUMN IF NOT EXISTS cmsStatus VARCHAR(20) NULL DEFAULT 'pending'`,
    `ALTER TABLE visitor_passes ADD COLUMN IF NOT EXISTS cmsSyncedAt DATETIME NULL`,
    `ALTER TABLE visitor_passes ADD COLUMN IF NOT EXISTS cmsError TEXT NULL`,
  ];

  for (const sql of alterStatements) {
    try {
      await sequelize.query(sql);
      console.log(`✅ ${sql.substring(0, 70)}...`);
    } catch (err) {
      // TiDB may not support IF NOT EXISTS on ADD COLUMN — handle duplicate column error gracefully
      if (err.original?.code === 'ER_DUP_FIELDNAME' || err.message?.includes('Duplicate column')) {
        console.log(`⚠️  Column already exists (skipped): ${sql.match(/ADD COLUMN\s+(\w+)/)?.[1]}`);
      } else {
        console.error(`❌ Failed: ${sql}`);
        console.error(err.message);
      }
    }
  }

  // Verify columns exist
  const [rows] = await sequelize.query(`SHOW COLUMNS FROM visitor_passes LIKE 'cms%'`);
  if (rows.length > 0) {
    console.log('\n✅ CMS columns in visitor_passes:');
    rows.forEach(r => console.log(`   - ${r.Field} (${r.Type})`));
  } else {
    console.warn('\n⚠️  No cms* columns found — check if TiDB supports IF NOT EXISTS syntax');
  }

  await database.disconnect();
  console.log('\n🏁 Migration complete.');
}

migrate().catch(err => {
  console.error('❌ Migration failed:', err.message);
  process.exit(1);
});

