/**
 * Migration Script: Convert static DPP HTML files to MongoDB documents
 * 
 * Usage: node scripts/migrateDpps.js
 * 
 * Assumptions:
 * - Your static DPP files are in a folder '../dpps' relative to the project root.
 * - Each HTML file contains questions with specific selectors (adjust below).
 * - You have a mapping of lecture IDs to file paths.
 */

const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const cheerio = require('cheerio');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

// Import the Dpp model
const Dpp = require('../models/Dpp');

// ========== CONFIGURATION ==========
// Define mapping: lectureId -> lectureName, file path, subject
// MODIFY THIS ARRAY to match your actual lectures and file locations
const dppMapping = [
    {
        lectureId: 'linear-arrangement-1',
        lectureName: 'Linear Arrangement - I',
        filePath: '../dpps/LA/lecture1.html',
        subject: 'Logical Reasoning'
    },
    {
        lectureId: 'linear-arrangement-2',
        lectureName: 'Linear Arrangement - II',
        filePath: '../dpps/LA/lecture2.html',
        subject: 'Logical Reasoning'
    },
    {
        lectureId: 'circular-arrangement-1',
        lectureName: 'Circular Arrangement - I',
        filePath: '../dpps/CA/lecture1.html',
        subject: 'Logical Reasoning'
    },
    // Add more entries as needed...
];

// ========== HTML PARSING FUNCTION ==========
/**
 * Parse the HTML content to extract questions.
 * 
 * ADJUST THIS FUNCTION based on the actual structure of your static DPP HTML files.
 * 
 * Example expected HTML structure:
 * <div class="question" data-correct="0">
 *   <p class="question-text">What is 2+2?</p>
 *   <div class="options">
 *     <div class="option">3</div>
 *     <div class="option">4</div>
 *     ...
 *   </div>
 * </div>
 */
function parseDppHtml(htmlContent, fileName) {
    const $ = cheerio.load(htmlContent);
    const questions = [];
    
    // Try multiple possible selectors (common patterns)
    let questionElements = $('.question');
    if (questionElements.length === 0) questionElements = $('[data-question]');
    if (questionElements.length === 0) questionElements = $('.mcq');
    if (questionElements.length === 0) questionElements = $('.problem');
    
    if (questionElements.length === 0) {
        console.warn(`  ⚠ No questions found in ${fileName}. Using fallback extraction.`);
        // Fallback: maybe the whole body contains a single question? Adjust as needed.
        return [];
    }
    
    questionElements.each((index, element) => {
        const $el = $(element);
        
        // Extract question text
        let questionText = $el.find('.question-text').first().text().trim();
        if (!questionText) questionText = $el.find('p').first().text().trim();
        if (!questionText) questionText = $el.find('.q').text().trim();
        if (!questionText) questionText = `Question ${index + 1}`; // fallback
        
        // Extract options
        const options = [];
        $el.find('.option').each((i, opt) => {
            options.push($(opt).text().trim());
        });
        if (options.length === 0) {
            // Try alternative selectors
            $el.find('li').each((i, li) => options.push($(li).text().trim()));
        }
        if (options.length === 0) {
            $el.find('label').each((i, label) => {
                const text = $(label).text().trim();
                if (text && !text.match(/^[A-D][\.\)]/)) options.push(text);
            });
        }
        
        // Extract correct answer index
        let correctAnswer = 0;
        const dataCorrect = $el.attr('data-correct');
        if (dataCorrect !== undefined) {
            correctAnswer = parseInt(dataCorrect, 10);
        } else {
            // Try to find an element with class 'correct' or 'answer'
            const correctEl = $el.find('.correct, .answer, [data-answer]');
            if (correctEl.length > 0) {
                const answerText = correctEl.text().trim();
                const idx = options.findIndex(opt => opt.includes(answerText));
                if (idx !== -1) correctAnswer = idx;
            }
        }
        
        // Extract explanation if present
        const explanation = $el.find('.explanation, .solution').text().trim() || '';
        
        questions.push({
            id: `q${index + 1}`,
            type: 'multiple-choice',
            questionText: questionText,
            options: options,
            correctAnswer: correctAnswer,
            explanation: explanation
        });
    });
    
    return questions;
}

// ========== MAIN MIGRATION FUNCTION ==========
async function migrate() {
    try {
        // Connect to MongoDB
        const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/final2';
        await mongoose.connect(mongoUri);
        console.log('✅ Connected to MongoDB\n');
        
        let successCount = 0;
        let skipCount = 0;
        let errorCount = 0;
        
        for (const item of dppMapping) {
            const filePath = path.join(__dirname, '..', item.filePath);
            
            console.log(`Processing: ${item.lectureName} (${item.lectureId})`);
            
            // Check if file exists
            if (!fs.existsSync(filePath)) {
                console.log(`  ⚠ File not found: ${filePath} — SKIPPING`);
                skipCount++;
                continue;
            }
            
            try {
                // Read and parse HTML
                const htmlContent = fs.readFileSync(filePath, 'utf8');
                const questions = parseDppHtml(htmlContent, path.basename(filePath));
                
                if (questions.length === 0) {
                    console.log(`  ⚠ No questions extracted — SKIPPING`);
                    skipCount++;
                    continue;
                }
                
                // Prepare DPP document
                const dppData = {
                    lectureId: item.lectureId,
                    lectureName: item.lectureName,
                    subject: item.subject,
                    questions: questions
                };
                
                // Upsert into database
                const result = await Dpp.findOneAndUpdate(
                    { lectureId: item.lectureId },
                    dppData,
                    { upsert: true, new: true, runValidators: true }
                );
                
                console.log(`  ✅ Migrated: ${questions.length} questions saved.`);
                successCount++;
                
            } catch (err) {
                console.error(`  ❌ Error processing ${item.lectureName}:`, err.message);
                errorCount++;
            }
        }
        
        console.log('\n=== MIGRATION SUMMARY ===');
        console.log(`✅ Successful: ${successCount}`);
        console.log(`⚠ Skipped: ${skipCount}`);
        console.log(`❌ Errors: ${errorCount}`);
        console.log('==========================\n');
        
    } catch (error) {
        console.error('Fatal migration error:', error);
    } finally {
        await mongoose.connection.close();
        console.log('Database connection closed.');
    }
}

// Run migration
migrate();
