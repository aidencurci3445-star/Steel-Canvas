import jwt from 'jsonwebtoken';
import fs from 'fs';
import path from 'path';

const envPath = path.join(process.cwd(), '.env');

// Manual parsing for Windows/BOM issues
console.log(`Checking for .env file at: ${envPath}`);
if (fs.existsSync(envPath)) {
    console.log("File found. Processing...");
    const envContent = fs.readFileSync(envPath, 'utf8');
    // Remove BOM, null bytes, and carriage returns first
    const cleanContent = envContent.replace(/^\uFEFF/g, '').replace(/\0/g, '').replace(/\r/g, '');
    cleanContent.split('\n').forEach(line => {
        const cleanLine = line.trim();
        if (cleanLine && !cleanLine.startsWith('#') && cleanLine.includes('=')) {
            const separatorIndex = cleanLine.indexOf('=');
            // Remove completely invisible characters from the parsed key
            const key = cleanLine.substring(0, separatorIndex).trim().replace(/[^\x20-\x7E]/g, '');
            const val = cleanLine.substring(separatorIndex + 1).trim().replace(/^['"]|['"]$/g, '');
            process.env[key] = val;
            console.log(`Loaded Key: ${key}`);
        }
    });
}

if (!process.env.JWT_SECRET) {
    console.error("ERROR: JWT_SECRET must be defined in .env to generate licenses.");
    process.exit(1);
}

// Admins can call: node generate_key.js "Client_Name_Or_Email"
const clientIdentifier = process.argv[2] || "Steel_Customer_" + Date.now();

// Generate a payload. You can add expiration or specific features here
const payload = {
    user: clientIdentifier,
    tier: 'pro',
    created_at: new Date().toISOString()
};

// Sign with no expiration (or add { expiresIn: '1y' } if desired)
const token = jwt.sign(payload, process.env.JWT_SECRET);

console.log("==================================================");
console.log("✨ OFFICIAL STEEL LICENSE GENERATED ✨");
console.log("Client: ", clientIdentifier);
console.log("==================================================");
console.log(`\n${token}\n`);
console.log("Instructions for User:");
console.log("In Steel CLI type: /register " + token);
console.log("==================================================");
