/**
 * One-time script to convert lecture subjectId strings (e.g., "quant") 
 * to proper MongoDB ObjectIds from the subjects collection.
 * 
 * Run with: node scripts/fixSubjectIds.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const Lecture = require('../models/Lecture');
const Subject = require('../models/Subject');

// Mapping of subjectId strings to subject names (based on your data)
const STRING_TO_NAME_MAP = {
  'quant': 'Quantitative Aptitude',
  'reasoning': 'Reasoning Ability',
  'english': 'English Language',
  'banking': 'Banking Awareness',
  'current': 'Current Affairs'
};

async function fixSubjectIds() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Connected to MongoDB\n');

    // Fetch all subjects
    const subjects = await Subject.find({});
    console.log('Subjects found:', subjects.length);
    
    // Build lookup map: subject name (lowercase) -> ObjectId
    const nameToIdMap = {};
    subjects.forEach(sub => {
      nameToIdMap[sub.name.toLowerCase()] = sub._id;
    });
    console.log('Subject map:', Object.keys(nameToIdMap));

    // Fetch all lectures
    const lectures = await Lecture.find({});
    console.log(`\nProcessing ${lectures.length} lectures...\n`);

    let updatedCount = 0;
    let skippedCount = 0;

    for (const lec of lectures) {
      const oldSubjectId = lec.subjectId;
      
      // Find the correct subject name for this string ID
      const subjectName = STRING_TO_NAME_MAP[oldSubjectId];
      
      if (!subjectName) {
        console.log(`⚠️  Unknown subjectId "${oldSubjectId}" in lecture "${lec.title}" – skipping`);
        skippedCount++;
        continue;
      }

      const newSubjectId = nameToIdMap[subjectName.toLowerCase()];
      
      if (!newSubjectId) {
        console.log(`❌ Subject "${subjectName}" not found in database – skipping`);
        skippedCount++;
        continue;
      }

      if (String(oldSubjectId) === String(newSubjectId)) {
        // Already correct
        continue;
      }

      // Update the lecture
      lec.subjectId = newSubjectId;
      await lec.save();
      updatedCount++;
      console.log(`✅ Updated: ${lec.title} (${oldSubjectId} → ${newSubjectId})`);
    }

    console.log('\n=== MIGRATION COMPLETE ===');
    console.log(`✅ Updated: ${updatedCount} lectures`);
    console.log(`⚠️  Skipped: ${skippedCount} lectures`);
    
  } catch (error) {
    console.error('Migration error:', error);
  } finally {
    await mongoose.connection.close();
    console.log('Database connection closed.');
  }
}

// Run the migration
fixSubjectIds();
